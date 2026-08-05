// G1b — runtime proof for the NFS shell (Fase 4).
//
// smoke-nfs-browser.mjs proves the *loader*: that the dynamic-feature remotes
// and Module Federation wiring answer. This script proves the *shell surfaces*
// the parity matrix names — sign-in, catalog, scaffolder, techdocs, settings,
// i18n — in a real browser against a real backend.
//
// Every check reports independently as present / absent / blocked with its own
// evidence, because a partial answer is the useful answer here: T4.7/T4.8 land
// after T4.1-T4.5, and "settings is not in this build" must read differently
// from "settings is in this build and broken".
//
// Which checks are allowed to fail the run is chosen by the caller:
//   NFS_SHELL_REQUIRED=boot,signIn,catalog   node scripts/smoke-nfs-shell.mjs
// Default is every check the build is expected to carry.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const baseUrl = process.env.NFS_SHELL_BASE_URL ?? 'http://localhost:17889';
const outDir = process.env.NFS_SHELL_OUT ?? '/tmp/nfs-g1b';
const required = (
  process.env.NFS_SHELL_REQUIRED ??
  'boot,signIn,consentRoute,catalogList,entityPage,entityGraph,createList,techdocsRoute,settingsPage,translation'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

fs.mkdirSync(outDir, { recursive: true });

const checks = {};
const pageErrors = [];
const consoleErrors = [];
const notes = [];

const record = (name, status, evidence) => {
  checks[name] = { status, evidence };
  // eslint-disable-next-line no-console
  console.log(`[${status.toUpperCase().padEnd(7)}] ${name} — ${evidence}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', error => pageErrors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const shot = async name => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
};

const bodyText = () => page.locator('body').innerText().catch(() => '');

// A surface is "reached" when the router resolved it. Backstage renders its own
// NotFound page for an unresolved route, so an absent plugin looks like a 200
// with PAGE NOT FOUND in the body — checking the HTTP status alone would pass.
const reached = async (route, marker, { timeout = 20_000 } = {}) => {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      expected => {
        const text = document.body?.innerText ?? '';
        if (text.includes('PAGE NOT FOUND')) return true;
        return expected.some(m => text.includes(m));
      },
      marker,
      { timeout },
    );
  } catch {
    /* fall through to the body inspection below */
  }
  const text = await bodyText();
  const notFound = text.includes('PAGE NOT FOUND');
  const matched = marker.find(m => text.includes(m));
  return { notFound, matched, text };
};

// ── 1. Boot ────────────────────────────────────────────────────────────────
const readiness = await fetch(`${baseUrl}/.backstage/health/v1/readiness`)
  .then(r => ({ ok: r.ok, status: r.status }))
  .catch(error => ({ ok: false, status: String(error) }));
record(
  'readiness',
  readiness.ok ? 'present' : 'absent',
  `GET /.backstage/health/v1/readiness → ${readiness.status}`,
);

await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
await page
  .waitForFunction(() => (document.body?.innerText ?? '').length > 0, undefined, {
    timeout: 30_000,
  })
  .catch(() => {});

// Static discovery is the mechanism app.packages.include drives
// (@backstage/frontend-defaults/dist/discovery.esm.js:37 filters
// window['__@backstage/discovered__'].modules through the include allowlist).
// Reading it here is what settles OFS-NFS-D-006 with evidence instead of a
// guess: a package listed in the allowlist but absent from this array is not
// being loaded that way, whatever the config says.
const staticDiscovery = await page
  .evaluate(() => {
    const discovered = window['__@backstage/discovered__'];
    return Array.isArray(discovered?.modules)
      ? discovered.modules.map(m => m.name)
      : [];
  })
  .catch(() => []);
notes.push(`staticDiscovery=${JSON.stringify(staticDiscovery)}`);

const bootShot = await shot('01-boot');
record(
  'boot',
  readiness.ok && pageErrors.length === 0 ? 'present' : 'absent',
  `readiness=${readiness.status} pageErrors=${pageErrors.length} consoleErrors=${consoleErrors.length} shot=${bootShot}`,
);

// ── 2. Sign-in (T4.1) + consent route (T4.2) ───────────────────────────────
const rootText = await bodyText();
const gitlabVisible = /gitlab/i.test(rootText);
const guestVisible = /guest/i.test(rootText);
const signInShot = await shot('02-signin');
record(
  'signIn',
  gitlabVisible ? 'present' : 'absent',
  `GitLab provider on the sign-in page: ${gitlabVisible}; guest offered: ${guestVisible}; shot=${signInShot}`,
);

// Sign in as guest when the page offers it. Everything past this point needs an
// identity: without one the catalog answers 401 and every surface renders empty
// for the wrong reason. GitLab is a real IdP (T5.6a) and is out of scope here,
// so guest is the bench identity — recorded, not hidden.
let signedIn = false;
if (guestVisible) {
  const enter = page.getByRole('button', { name: /^enter$/i }).first();
  const clickable = await enter
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (clickable) {
    await enter.click();
    signedIn = await page
      .waitForFunction(
        () => !(document.body?.innerText ?? '').includes('Enter as a Guest User.'),
        undefined,
        { timeout: 15_000 },
      )
      .then(() => true)
      .catch(() => false);
  }
}
notes.push(`guestSignIn=${signedIn}`);

{
  // @backstage/plugin-auth registers this route. A bare session id has no
  // backing session, so the page is expected to render its own error rather
  // than a consent form — that still proves the route resolved, which is the
  // claim. A full approve/reject needs a registered OIDC client (T4.2's
  // backend half) and is out of scope for a browser smoke.
  const { notFound, matched, text } = await reached(
    '/oauth2/authorize/g1b-smoke-nonexistent-session',
    ['Authorize', 'authorize', 'Error', 'error', 'not found'],
  );
  const file = await shot('03-consent');
  record(
    'consentRoute',
    notFound ? 'absent' : 'present',
    `route resolved=${!notFound} marker=${matched ?? 'none'} bodyHead=${JSON.stringify(text.slice(0, 120))} shot=${file}`,
  );
}

// ── 3. Catalog (T4.3) ──────────────────────────────────────────────────────
{
  // Deliberately NOT matching on 'Owner' or any other column header. The first
  // version of this check did, and it passed against a table whose body was
  // still showing a spinner — proving the page chrome rendered, which is not
  // the claim. The list loads asynchronously, so the only honest signals are
  // the fixture row itself or an explicit empty state.
  const { notFound, text } = await reached(
    '/catalog',
    ['nfs-kubernetes-control', 'No records to display', 'No entities found'],
    { timeout: 30_000 },
  );
  const fixtureVisible = text.includes('nfs-kubernetes-control');
  const file = await shot('04-catalog');
  record(
    'catalogList',
    notFound ? 'absent' : fixtureVisible ? 'present' : 'blocked',
    `fixtureRowVisible=${fixtureVisible} routeResolved=${!notFound} shot=${file}`,
  );
}
{
  const { notFound, matched } = await reached(
    '/catalog/default/component/nfs-kubernetes-control',
    ['nfs-kubernetes-control'],
  );
  const file = await shot('05-entity');
  record(
    'entityPage',
    !notFound && Boolean(matched) ? 'present' : 'absent',
    `marker=${matched ?? 'none'} shot=${file}`,
  );
}
{
  const { notFound, matched } = await reached(
    '/catalog-graph?rootEntityRefs=component%3Adefault%2Fnfs-kubernetes-control',
    ['Catalog Graph', 'nfs-kubernetes-control'],
  );
  const file = await shot('06-graph');
  record(
    'entityGraph',
    !notFound && Boolean(matched) ? 'present' : 'absent',
    `marker=${matched ?? 'none'} shot=${file}`,
  );
}

// ── 4. Scaffolder (T4.4) ───────────────────────────────────────────────────
{
  const { notFound, matched, text } = await reached('/create', [
    'Templates',
    'Create a new component',
    'No templates',
  ]);
  const file = await shot('07-create');
  record(
    'createList',
    !notFound ? 'present' : 'absent',
    `marker=${matched ?? 'none'} templateVisible=${/template/i.test(text)} shot=${file}`,
  );
}

// ── 5. TechDocs (T4.5) ─────────────────────────────────────────────────────
{
  const { notFound, matched, text } = await reached('/docs', [
    'Documentation',
    'DOCS',
    'No documents',
  ]);
  const file = await shot('08-techdocs');
  record(
    'techdocsRoute',
    !notFound ? 'present' : 'absent',
    `marker=${matched ?? 'none'} bodyHead=${JSON.stringify(text.slice(0, 120))} shot=${file}`,
  );
}

// ── 6. Settings (T4.8) ─────────────────────────────────────────────────────
{
  const { notFound, matched, text } = await reached('/settings', [
    'General',
    'Authentication Providers',
    'Feature Flags',
  ]);
  const tabs = ['General', 'Authentication Providers', 'Feature Flags'].filter(t =>
    text.includes(t),
  );
  const file = await shot('09-settings');
  record(
    'settingsPage',
    notFound ? 'absent' : tabs.length === 3 ? 'present' : 'blocked',
    `subTabs=${JSON.stringify(tabs)} marker=${matched ?? 'none'} shot=${file}`,
  );
}

// ── 7. Custom translation (T4.7) ───────────────────────────────────────────
{
  // Markers are supplied by the caller so this file needs no edit when T4.7
  // changes its wording. Accepts one or more `text@route` pairs, comma
  // separated — more than one matters because each override lives on a
  // different translation ref, so a single passing marker only proves that ref
  // was applied, not that the module was.
  //   NFS_SHELL_TRANSLATION_MARKERS='Enter DevPortal@/,Look & Feel@/settings'
  const spec =
    process.env.NFS_SHELL_TRANSLATION_MARKERS ??
    (process.env.NFS_SHELL_TRANSLATION_MARKER
      ? `${process.env.NFS_SHELL_TRANSLATION_MARKER}@${process.env.NFS_SHELL_TRANSLATION_ROUTE ?? '/settings'}`
      : '');
  if (!spec) {
    record(
      'translation',
      'blocked',
      'no marker configured — set NFS_SHELL_TRANSLATION_MARKERS to check custom wording',
    );
  } else {
    const pairs = spec
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const at = entry.lastIndexOf('@');
        return at === -1
          ? { marker: entry, route: '/' }
          : { marker: entry.slice(0, at), route: entry.slice(at + 1) };
      });
    const results = [];
    for (const [index, { marker, route }] of pairs.entries()) {
      const { text } = await reached(route, [marker]);
      const file = await shot(`10-translation-${index + 1}`);
      results.push({ marker, route, found: text.includes(marker), shot: file });
    }
    notes.push(`translationMarkers=${JSON.stringify(results)}`);
    const found = results.filter(r => r.found);
    record(
      'translation',
      found.length === results.length
        ? 'present'
        : found.length > 0
          ? 'blocked'
          : 'absent',
      `${found.length}/${results.length} markers found: ${results
        .map(r => `${JSON.stringify(r.marker)}@${r.route}=${r.found}`)
        .join(' ')}`,
    );
  }
}

await browser.close();

const report = {
  baseUrl,
  outDir,
  required,
  checks,
  notes,
  pageErrors,
  consoleErrors,
};
const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
// eslint-disable-next-line no-console
console.log(`\nreport: ${reportPath}`);

const failed = required.filter(name => checks[name]?.status !== 'present');
if (failed.length > 0) {
  // eslint-disable-next-line no-console
  console.log(`REQUIRED CHECKS NOT PRESENT: ${failed.join(', ')}`);
  process.exitCode = 1;
}
