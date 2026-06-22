// Unit tests for the pure transforms in regenerate-extensions-install.js
// (ADR-014 stateless pre-step). No DB / filesystem — run with: node --test docker/
//
// The DB-backed end-to-end behavior (pluginDivisionMode database/schema,
// unreachable degrade, idempotency) is exercised by the spike rig described in
// docs/superpowers/plans/2026-06-22-stateless-persistence-pre-step.md.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseConfigTargets,
  pgClientConfig,
  rowsToPlugins,
} = require('./regenerate-extensions-install.js');

test('parseConfigTargets collects repeated --config paths in order', () => {
  const targets = parseConfigTargets([
    '--config',
    '/app/app-config.yaml',
    '--config',
    '/app/app-config.production.yaml',
    '--config',
    '/app/app-config.saas.yaml',
  ]);
  assert.deepEqual(targets, [
    { type: 'path', target: '/app/app-config.yaml' },
    { type: 'path', target: '/app/app-config.production.yaml' },
    { type: 'path', target: '/app/app-config.saas.yaml' },
  ]);
});

test('parseConfigTargets ignores a trailing --config with no value', () => {
  assert.deepEqual(parseConfigTargets(['--config']), []);
});

test('pgClientConfig (object) overrides the database name for pluginDivisionMode=database', () => {
  const cfg = pgClientConfig(
    { host: 'db', port: 5432, user: 'u', password: 'p', database: 'backstage' },
    'backstage_plugin_extensions',
  );
  assert.equal(cfg.host, 'db');
  assert.equal(cfg.database, 'backstage_plugin_extensions');
  assert.equal(cfg.user, 'u');
  // bounded timeouts are always present so an unreachable DB degrades
  assert.equal(typeof cfg.connectionTimeoutMillis, 'number');
  assert.equal(typeof cfg.statement_timeout, 'number');
});

test('pgClientConfig (object) keeps the connection database when no override (schema mode)', () => {
  const cfg = pgClientConfig(
    { host: 'db', port: 5432, user: 'u', password: 'p', database: 'backstage' },
    undefined,
  );
  assert.equal(cfg.database, 'backstage');
});

test('pgClientConfig passes ssl through untouched', () => {
  const cfg = pgClientConfig({
    host: 'db',
    database: 'b',
    ssl: { rejectUnauthorized: true },
  });
  assert.deepEqual(cfg.ssl, { rejectUnauthorized: true });
});

test('pgClientConfig (string) rewrites the db path in the connection URL on override', () => {
  const cfg = pgClientConfig(
    'postgresql://u:p@host:5432/backstage',
    'backstage_plugin_extensions',
  );
  assert.match(cfg.connectionString, /\/backstage_plugin_extensions$/);
  assert.equal(typeof cfg.connectionTimeoutMillis, 'number');
});

test('pgClientConfig (string) is left intact when no override', () => {
  const cfg = pgClientConfig('postgresql://u:p@host:5432/backstage');
  assert.equal(cfg.connectionString, 'postgresql://u:p@host:5432/backstage');
});

test('rowsToPlugins parses config_yaml into the full plugin entry', () => {
  const plugins = rowsToPlugins([
    {
      package_name: 'backstage-plugin-sonarqube',
      disabled: false,
      config_yaml:
        'package: oci://quay.io/veecode/sonarqube:bs_1.49.4!backstage-plugin-sonarqube\n' +
        'disabled: false\n' +
        'pluginConfig:\n  some: value\n',
    },
  ]);
  assert.equal(plugins.length, 1);
  assert.equal(
    plugins[0].package,
    'oci://quay.io/veecode/sonarqube:bs_1.49.4!backstage-plugin-sonarqube',
  );
  assert.equal(plugins[0].disabled, false);
  assert.deepEqual(plugins[0].pluginConfig, { some: 'value' });
});

test('rowsToPlugins synthesizes {package, disabled} when config_yaml is null', () => {
  const plugins = rowsToPlugins([
    {
      package_name: 'backstage-plugin-tech-radar',
      disabled: true,
      config_yaml: null,
    },
  ]);
  assert.deepEqual(plugins, [
    { package: 'backstage-plugin-tech-radar', disabled: true },
  ]);
});

test('rowsToPlugins backfills disabled from the column when config_yaml omits it', () => {
  const plugins = rowsToPlugins([
    {
      package_name: 'backstage-plugin-x',
      disabled: true,
      config_yaml: 'package: oci://example/x\n', // no `disabled:` key
    },
  ]);
  assert.equal(plugins[0].disabled, true);
});

test('rowsToPlugins preserves order and handles a mixed batch', () => {
  const plugins = rowsToPlugins([
    {
      package_name: 'a',
      disabled: false,
      config_yaml: 'package: oci://a\ndisabled: false\n',
    },
    { package_name: 'b', disabled: true, config_yaml: null },
  ]);
  assert.deepEqual(plugins, [
    { package: 'oci://a', disabled: false },
    { package: 'b', disabled: true },
  ]);
});

test('rowsToPlugins falls back to {package, disabled} when config_yaml is malformed (one bad row does not drop the rest)', () => {
  const plugins = rowsToPlugins([
    {
      package_name: 'broken',
      disabled: false,
      config_yaml: 'key: "unterminated',
    },
    {
      package_name: 'good',
      disabled: false,
      config_yaml: 'package: oci://good\n',
    },
  ]);
  assert.deepEqual(plugins, [
    { package: 'broken', disabled: false }, // synthesized from the PK, not dropped
    { package: 'oci://good', disabled: false },
  ]);
});

test('rowsToPlugins backfills package from package_name when config_yaml omits it', () => {
  const plugins = rowsToPlugins([
    {
      package_name: 'oci://from-pk',
      disabled: false,
      config_yaml: 'pluginConfig:\n  a: 1\n',
    },
  ]);
  assert.equal(plugins[0].package, 'oci://from-pk');
  assert.deepEqual(plugins[0].pluginConfig, { a: 1 });
});
