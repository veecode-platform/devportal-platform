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
 *       'database' (default) → a separate database `${prefix}extensions`
 *                              (e.g. `backstage_plugin_extensions` with the default prefix);
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
  if (connection.ssl !== undefined) c.ssl = connection.ssl; // object-form ssl passthrough (string connections carry ssl in the URL)
  return c;
}

// Discover the schema owning `marketplace_installations` and read it — on a
// SINGLE connection (one TCP+TLS+auth handshake at boot). Prefers a schema whose
// name mentions "extensions" when several match. Returns {schema, rows}; schema
// is undefined when the table exists nowhere reachable (fresh tenant).
async function loadInstallations(clientConfig) {
  const client = new Client(clientConfig);
  await client.connect();
  try {
    const schemaRes = await client.query(
      `SELECT table_schema FROM information_schema.tables
        WHERE table_name = $1
        ORDER BY (table_schema LIKE '%extensions%') DESC, table_schema
        LIMIT 1`,
      [TABLE],
    );
    const schema = schemaRes.rows[0]
      ? schemaRes.rows[0].table_schema
      : undefined;
    if (!schema) return { schema: undefined, rows: [] };
    const dataRes = await client.query(
      `SELECT config_yaml, package_name, disabled FROM "${schema}"."${TABLE}" ORDER BY package_name`,
    );
    return { schema, rows: dataRes.rows };
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
      // A single corrupt config_yaml must NOT drop every selection — parse
      // per-row and fall through to the synthesized entry on bad YAML.
      let parsed;
      try {
        parsed = YAML.parse(raw);
      } catch (e) {
        warn(
          `config_yaml for "${row.package_name}" is not valid YAML (${e.message}); using {package, disabled} instead`,
        );
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.disabled === undefined && row.disabled != null) {
          parsed.disabled = !!row.disabled;
        }
        if (!parsed.package) parsed.package = row.package_name; // backfill from the PK
        if (!parsed.package) {
          warn(
            `row has no package_name and config_yaml has no package; skipping`,
          );
          continue;
        }
        plugins.push(parsed);
        continue;
      }
    }
    if (!row.package_name) {
      warn(`row has empty package_name and no usable config_yaml; skipping`);
      continue;
    }
    plugins.push({ package: row.package_name, disabled: !!row.disabled });
  }
  return plugins;
}

function writeAtomic(filePath, contents) {
  const tmp = path.join(
    path.dirname(filePath),
    `.extensions-install.${process.pid}.tmp`,
  );
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

  // Read everything we need, then release the config (and any file watchers it
  // opened) exactly once before any early return.
  const client = config.getOptionalString('backend.database.client');
  const connection = config.getOptional('backend.database.connection');
  const mode =
    config.getOptionalString('backend.database.pluginDivisionMode') ||
    'database';
  const prefix =
    config.getOptionalString('backend.database.prefix') || DEFAULT_PREFIX;
  if (config.close) config.close();

  if (client !== 'pg') {
    log(
      `backend.database.client=${
        client || 'unset'
      } (not pg) — no-op, ${outFile} unchanged`,
    );
    return;
  }
  if (!connection) {
    warn(
      `backend.database.client=pg but no backend.database.connection found; leaving ${outFile} as-is`,
    );
    return;
  }

  const overrideDb = mode === 'schema' ? undefined : `${prefix}${PLUGIN_ID}`;
  const where =
    mode === 'schema' ? "the connection's database" : `database ${overrideDb}`;

  // pgClientConfig is pure but can throw (e.g. a malformed connection URL) —
  // build it OUTSIDE the DB try so a config error reads as a config error, not
  // a "could not read marketplace_installations" DB error.
  let clientConfig;
  try {
    clientConfig = pgClientConfig(connection, overrideDb);
  } catch (e) {
    warn(
      `invalid backend.database.connection (${e.message}); leaving ${outFile} as-is`,
    );
    return;
  }

  let schema;
  let rows;
  try {
    ({ schema, rows } = await loadInstallations(clientConfig));
  } catch (e) {
    warn(`could not read ${TABLE} (${e.message}); leaving ${outFile} as-is`);
    return;
  }
  if (!schema) {
    warn(
      `pluginDivisionMode=${mode} — ${TABLE} not found in ${where} (fresh tenant / plugin not migrated yet); leaving ${outFile} as-is`,
    );
    return;
  }
  log(
    `pluginDivisionMode=${mode} — read "${schema}".${TABLE} in ${where} (${rows.length} row(s))`,
  );

  const plugins = rowsToPlugins(rows);
  try {
    writeAtomic(outFile, YAML.stringify({ plugins }));
    log(
      `regenerated ${outFile} with ${plugins.length} plugin selection(s) from the database`,
    );
  } catch (e) {
    warn(
      `could not write ${outFile} (${e.message}); boot continues with the existing file`,
    );
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    e => {
      warn(
        `unexpected error (${
          e && e.message
        }); leaving extensions-install.yaml as-is, boot continues`,
      );
      process.exit(0);
    },
  );
}

// Exported for unit tests (the pure transforms have no I/O).
module.exports = { parseConfigTargets, pgClientConfig, rowsToPlugins };
