#!/usr/bin/env node
/**
 * ADR-014 stateless pre-step — regenerate extensions-install.yaml from the
 * external database BEFORE install-dynamic-plugins.py runs.
 *
 * The marketplace backend (pluginId "extensions") persists the operator's
 * plugin selections to Postgres (table `marketplace_installations`) and mirrors
 * them to ${DEVPORTAL_DB_PATH}/extensions-install.yaml as a write-through cache.
 * On a stateless pod /app/data is empty at boot, so this file must be rebuilt
 * from the DB before the standalone Python installer reads it (the installer
 * runs before the Node backend, so it cannot read the DB itself).
 *
 * Behavior:
 *   - Gate: act only when backend.database.client === 'pg'. Otherwise no-op —
 *     SQLite / file-PVC deployments are unchanged (today's write-through stays).
 *   - Locate `marketplace_installations` honoring backend.database.pluginDivisionMode:
 *       'database' (default) → a separate database `<prefix>extensions`;
 *       'schema'             → a schema inside the connection's database.
 *     The owning schema is DISCOVERED via information_schema rather than guessed,
 *     so both modes work without hardcoding a schema name.
 *   - Write {plugins: [...]} atomically (temp file + rename) to
 *     ${DEVPORTAL_DB_PATH:-/app/data}/extensions-install.yaml.
 *   - Never hard-fail the boot: on any config/DB/write error, leave the file the
 *     entrypoint already guaranteed in place and log a warning.
 *
 * Config is read with the same --config files the backend gets (passed as args),
 * via @backstage/config-loader, so ${VAR:-default} and the SaaS/preset database
 * config are resolved exactly as the backend sees them.
 *
 * Schema contract (pinned, see ADR-014): table `marketplace_installations`,
 * columns `package_name`, `disabled`, `config_yaml`.
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { ConfigSources } = require('@backstage/config-loader');
const { Client } = require('pg');

const PLUGIN_ID = 'extensions';
const DEFAULT_PREFIX = 'backstage_plugin_';
const TABLE = 'marketplace_installations';

// Bounded timeouts so an unreachable/slow DB DEGRADES (empty/unchanged file)
// instead of hanging the boot. Without connectionTimeoutMillis, pg.connect()
// waits on the OS TCP timeout — the "DB unreachable → degrade" fail-safe relies
// on this bound.
const CONNECT_TIMEOUT_MS = 5000;
const STATEMENT_TIMEOUT_MS = 10000;

const log = msg => process.stdout.write(`VEECODE prestep: ${msg}\n`);
const warn = msg => process.stderr.write(`VEECODE prestep: WARNING — ${msg}\n`);

// Parse repeated `--config <path>` args (the same shape the entrypoint passes).
function parseConfigTargets(argv) {
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) {
      targets.push({ type: 'path', target: argv[i + 1] });
      i++;
    }
  }
  return targets;
}

async function loadConfig(targets) {
  const source = ConfigSources.defaultForTargets({
    targets,
    rootDir: '/app',
    watch: false,
    allowMissingDefaultConfig: true,
  });
  return ConfigSources.toConfig(source);
}

// Build a pg client config from backend.database.connection (string or object),
// optionally overriding the database name (pluginDivisionMode: database).
function pgClientConfig(connection, overrideDb) {
  const timeouts = {
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  };
  if (typeof connection === 'string') {
    if (!overrideDb) return { connectionString: connection, ...timeouts };
    const u = new URL(connection);
    u.pathname = `/${overrideDb}`;
    return { connectionString: u.toString(), ...timeouts };
  }
  const c = {
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: overrideDb || connection.database,
    ...timeouts,
  };
  if (connection.ssl !== undefined) c.ssl = connection.ssl; // pass ssl through untouched
  return c;
}

// Find the schema owning `marketplace_installations` in the connected database.
// Prefers a schema whose name mentions "extensions" when several match.
async function findSchema(clientConfig) {
  const client = new Client(clientConfig);
  await client.connect();
  try {
    const res = await client.query(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = $1
        ORDER BY (table_schema LIKE '%extensions%') DESC, table_schema
        LIMIT 1`,
      [TABLE],
    );
    return res.rows[0] ? res.rows[0].table_schema : undefined;
  } finally {
    await client.end();
  }
}

async function queryInstallations(clientConfig, schema) {
  const client = new Client(clientConfig);
  await client.connect();
  try {
    const res = await client.query(
      `SELECT config_yaml, package_name, disabled FROM "${schema}".${TABLE} ORDER BY package_name`,
    );
    return res.rows;
  } finally {
    await client.end();
  }
}

// Mirror the marketplace backend's syncToYamlFile: use the stored plugin entry
// (config_yaml) when present, otherwise synthesize {package, disabled}.
function rowsToPlugins(rows) {
  const plugins = [];
  for (const row of rows) {
    const raw = row.config_yaml != null ? String(row.config_yaml).trim() : '';
    if (raw) {
      const parsed = YAML.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.disabled === undefined && row.disabled != null) {
          parsed.disabled = row.disabled;
        }
        plugins.push(parsed);
        continue;
      }
    }
    plugins.push({ package: row.package_name, disabled: !!row.disabled });
  }
  return plugins;
}

function writeAtomic(filePath, contents) {
  const tmp = path.join(path.dirname(filePath), `.extensions-install.${process.pid}.tmp`);
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

async function main() {
  const targets = parseConfigTargets(process.argv.slice(2));
  const dbPath = process.env.DEVPORTAL_DB_PATH || '/app/data';
  const outFile = path.join(dbPath, 'extensions-install.yaml');

  let config;
  try {
    config = await loadConfig(targets);
  } catch (e) {
    warn(`could not load app-config (${e.message}); leaving ${outFile} as-is`);
    return;
  }

  const client = config.getOptionalString('backend.database.client');
  if (client !== 'pg') {
    log(`backend.database.client=${client || 'unset'} (not pg) — no-op, ${outFile} unchanged`);
    if (config.close) config.close();
    return;
  }

  const connection = config.getOptional('backend.database.connection');
  const mode = config.getOptionalString('backend.database.pluginDivisionMode') || 'database';
  const prefix = config.getOptionalString('backend.database.prefix') || DEFAULT_PREFIX;
  if (config.close) config.close();

  if (!connection) {
    warn(`backend.database.client=pg but no backend.database.connection found; leaving ${outFile} as-is`);
    return;
  }

  let rows;
  try {
    const overrideDb = mode === 'schema' ? undefined : `${prefix}${PLUGIN_ID}`;
    const clientConfig = pgClientConfig(connection, overrideDb);
    const where = mode === 'schema' ? "the connection's database" : `database ${overrideDb}`;
    const schema = await findSchema(clientConfig);
    if (!schema) {
      warn(`pluginDivisionMode=${mode} — ${TABLE} not found in ${where} (fresh tenant / plugin not migrated yet); leaving ${outFile} as-is`);
      return;
    }
    log(`pluginDivisionMode=${mode} — reading "${schema}".${TABLE} in ${where}`);
    rows = await queryInstallations(clientConfig, schema);
  } catch (e) {
    warn(`could not read ${TABLE} (${e.message}); leaving ${outFile} as-is`);
    return;
  }

  const plugins = rowsToPlugins(rows);
  try {
    writeAtomic(outFile, YAML.stringify({ plugins }));
    log(`regenerated ${outFile} with ${plugins.length} plugin selection(s) from the database`);
  } catch (e) {
    warn(`could not write ${outFile} (${e.message}); boot continues with the existing file`);
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    e => {
      warn(`unexpected error (${e && e.message}); leaving extensions-install.yaml as-is, boot continues`);
      process.exit(0);
    },
  );
}

// Exported for unit tests (the pure transforms have no I/O).
module.exports = { parseConfigTargets, pgClientConfig, rowsToPlugins };
