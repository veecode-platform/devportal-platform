// T5.3 — runtime proof for the upstream global header.
//
// Separate from smoke-nfs-shell.mjs on purpose. The header is a different front
// with its own acceptance list, and it changes the boot's console-error profile:
// the search slot renders but its query API is registered nowhere, so the header
// build emits a NotImplementedError the shell build does not. Folding these
// checks into the shell smoke would have made that regression invisible by
// loosening the shell's zero-console-errors assertion.
//
// Selectors come from the T5.3 author's own live-DOM run, not from guessing.
// Two of the seven surfaces are expected ABSENT — the Vertigo badge and Pending
// Changes live in unpublished packages — so "absent" is a pass for those and a
// present result is the regression.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const baseUrl = process.env.NFS_HEADER_BASE_URL ?? 'http://localhost:17889';
const outDir = process.env.NFS_HEADER_OUT ?? '/tmp/nfs-header';

fs.mkdirSync(outDir, { recursive: true });

const checks = {};
const pageErrors = [];
const consoleErrors = [];
// A console error reading only "Failed to load resource: 404" names nothing, and
// five of them are indistinguishable from each other. Recording the failing
// responses turns that into a list of endpoints, which is the difference between
// a finding and a shrug.
const failedResponses = [];

const record = (name, status, evidence) => {
  checks[name] = { status, evidence };
  // eslint-disable-next-line no-console
  console.log(`[${status.toUpperCase().padEnd(7)}] ${name} — ${evidence}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('response', response => {
  if (response.status() >= 400) {
    failedResponses.push(`${response.status()} ${response.url()}`);
  }
});

const shot = async name => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
};

// The header only exists for a signed-in user, so guest first. Guest is offered
// because auth.environment is 'development' on the bench (OFS parity, see
// src/signIn.tsx).
await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
const enter = page.getByRole('button', { name: /^enter$/i }).first();
let signedIn = false;
if (await enter.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false)) {
  await enter.click();
  signedIn = await page
    .waitForFunction(
      () => !(document.body?.innerText ?? '').includes('Enter as a Guest User.'),
      undefined,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
}
await page.waitForTimeout(2_000);
const headerShot = await shot('01-header');
record('signedIn', signedIn ? 'present' : 'absent', `guest sign-in: ${signedIn}; shot=${headerShot}`);

const byLabel = async (name, pattern, { expect = 'present' } = {}) => {
  const count = await page.getByLabel(pattern).count().catch(() => 0);
  const found = count > 0;
  const pass = expect === 'present' ? found : !found;
  record(
    name,
    pass ? 'present' : 'absent',
    `expected=${expect} matches=${count} selector=${String(pattern)}`,
  );
  return found;
};

// (a) search — the slot, not a working query. Its API is registered nowhere in
// this app on either side of the T5.3 diff, so a functional search is out of
// scope; what T5.3 owns is whether the header renders the slot.
{
  const searchBox = await page.getByRole('textbox').count().catch(() => 0);
  const searchLabelled = await page
    .getByLabel(/search/i)
    .count()
    .catch(() => 0);
  const found = searchBox > 0 || searchLabelled > 0;
  record(
    'search',
    found ? 'present' : 'absent',
    `slot rendered=${found} (textboxes=${searchBox} search-labelled=${searchLabelled}); query API deliberately not asserted — not wired on either side of this diff`,
  );
}

await byLabel('notifications', /notifications\.?$/i);
await byLabel('starredItems', /your starred items/i);
await byLabel('themeToggle', /^theme$/i);

// (e) profile menu — click the signed-in principal, then look for the three items.
{
  // Unanchored on purpose. The trigger's label is the signed-in principal's
  // display name, so it changes with the catalog: it read "ADMIN" (the entity
  // ref) until a User entity with `profile.displayName: Bench Admin` existed,
  // at which point an anchored /^admin$/i stopped matching and the check
  // reported the menu absent on a build where it rendered fine. Identity text is
  // not a stable selector.
  let opened = false;
  for (const name of [/admin/i, /guest/i, /profile/i]) {
    const trigger = page.getByRole('button', { name }).first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click().catch(() => {});
      opened = true;
      break;
    }
  }
  await page.waitForTimeout(1_000);
  const text = await page.locator('body').innerText().catch(() => '');
  const items = ['Settings', 'My profile', 'Sign out'].filter(i =>
    text.toLowerCase().includes(i.toLowerCase()),
  );
  const file = await shot('02-profile-menu');
  record(
    'profileMenu',
    items.length === 3 ? 'present' : opened ? 'blocked' : 'absent',
    `triggerClicked=${opened} items=${JSON.stringify(items)} shot=${file}`,
  );
}

// (f) Vertigo badge — expected ABSENT. Present would be the regression.
{
  const text = await page.locator('body').innerText().catch(() => '');
  const found = /vertigo/i.test(text);
  record(
    'vertigoBadgeAbsent',
    found ? 'absent' : 'present',
    `"vertigo" in DOM text=${found} (expected false — the package is unpublished, npm 404)`,
  );
}

// (g) Pending Changes — expected ABSENT. Deliberately NOT a text grep for
// "pending": @backstage/ui's ButtonIcon carries a data-ispending attribute that
// false-positives such a check. Matching on the plugin's own overlay role
// instead.
{
  const overlay = await page
    .locator('[data-testid*="pending-changes" i], [class*="PendingChanges" i]')
    .count()
    .catch(() => 0);
  record(
    'pendingChangesAbsent',
    overlay === 0 ? 'present' : 'absent',
    `pending-changes overlay nodes=${overlay} (expected 0 — unpublished, npm 404); data-ispending deliberately not used as the signal`,
  );
}

await browser.close();

// The search gap is a known, pre-existing absence rather than a header defect,
// so it is classified rather than allowed to sink the run silently.
const searchApiErrors = consoleErrors.filter(e =>
  e.includes('plugin.search.queryservice'),
);
const otherConsoleErrors = consoleErrors.filter(
  e => !e.includes('plugin.search.queryservice'),
);
record(
  'consoleClean',
  otherConsoleErrors.length === 0 ? 'present' : 'absent',
  `unexpected console errors=${otherConsoleErrors.length}; known search-API errors=${searchApiErrors.length}; pageErrors=${pageErrors.length}; failedResponses=${JSON.stringify(failedResponses)}`,
);

const report = {
  baseUrl,
  outDir,
  checks,
  pageErrors,
  consoleErrors,
  failedResponses,
  searchApiErrors,
  otherConsoleErrors,
};
const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
// eslint-disable-next-line no-console
console.log(`\nreport: ${reportPath}`);

const failed = Object.entries(checks)
  .filter(([, v]) => v.status !== 'present')
  .map(([k]) => k);
if (failed.length > 0) {
  // eslint-disable-next-line no-console
  console.log(`NOT PRESENT: ${failed.join(', ')}`);
  process.exitCode = 1;
}
