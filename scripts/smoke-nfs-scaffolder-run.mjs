// G1b item 4, second half — actually EXECUTE a template through the NFS shell.
//
// smoke-nfs-shell.mjs proves /create and the Templates list render. That is not
// the same claim as "the scaffolder works": the interesting part is the chain
// form -> submit -> backend task -> step output, because every link in it lives
// in a different package and the NFS host only supplies the first.
//
// Drives the real wizard in a browser rather than POSTing to the API, then
// reads the task's own event log to confirm the steps ran server-side. Only
// debug:log steps are involved (see fixtures/g1b-shell-template.yaml) so nothing
// leaves the bench.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const baseUrl = process.env.NFS_SHELL_BASE_URL ?? 'http://localhost:17889';
const outDir = process.env.NFS_SHELL_OUT ?? '/tmp/nfs-g1b/scaffolder';
const templateName = process.env.NFS_SHELL_TEMPLATE ?? 'g1b-shell-smoke';
const inputName = process.env.NFS_SHELL_TEMPLATE_INPUT ?? 'g1b-runtime-proof';

fs.mkdirSync(outDir, { recursive: true });

const pageErrors = [];
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

const shot = async name => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
};

// Guest is offered because auth.environment is 'development' on the bench — the
// OFS parity branch in src/signIn.tsx. A real GitLab IdP is T5.6a.
await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
const enter = page.getByRole('button', { name: /^enter$/i }).first();
if (await enter.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)) {
  await enter.click();
  await page
    .waitForFunction(
      () => !(document.body?.innerText ?? '').includes('Enter as a Guest User.'),
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => {});
}

await page.goto(`${baseUrl}/create/templates/default/${templateName}`, {
  waitUntil: 'domcontentloaded',
});
await page
  .waitForFunction(() => (document.body?.innerText ?? '').includes('Name'), undefined, {
    timeout: 30_000,
  })
  .catch(() => {});
const wizardShot = await shot('01-wizard');

// `name` is the template's only schema-level required parameter, but
// RepoUrlPicker renders Owner and Repository as required of its own accord — the
// first run of this script filled only Name, and the Review button then swallowed
// six clicks without advancing because the form was invalid. Fill all three.
const fill = async (label, value) => {
  const field = page.getByLabel(label).first();
  const ok = await field
    .fill(value)
    .then(() => true)
    .catch(() => false);
  return { label: String(label), value, filled: ok };
};
const filled = [
  await fill(/^Name/, inputName),
  await fill(/^Owner/, 'veecode-demos'),
  await fill(/^Repository/, inputName),
];

// Advance the wizard. The button is labelled "Review" on the last input step,
// not "Next" — verified from the rendered form. Stop as soon as the Create
// button appears rather than clicking a fixed number of times, so an invalid
// form fails loudly instead of looping.
let advanced = 0;
for (let i = 0; i < 6; i += 1) {
  if (await page.getByRole('button', { name: /^create$/i }).first().isVisible().catch(() => false)) {
    break;
  }
  const next = page.getByRole('button', { name: /^(next|review)$/i }).first();
  if (!(await next.isVisible().catch(() => false))) break;
  if (await next.isDisabled().catch(() => false)) break;
  await next.click();
  advanced += 1;
  await page.waitForTimeout(750);
}
const reviewShot = await shot('02-review');

const createButton = page.getByRole('button', { name: /^create$/i }).first();
const submitted = await createButton
  .click()
  .then(() => true)
  .catch(() => false);

// On submit the shell navigates to /create/tasks/<taskId>.
let taskId;
try {
  await page.waitForURL(/\/create\/tasks\/[0-9a-f-]+/i, { timeout: 30_000 });
  taskId = page.url().split('/').pop();
} catch {
  /* taskId stays undefined; reported as such */
}
await page
  .waitForFunction(
    () => {
      const text = document.body?.innerText ?? '';
      return text.includes('Completed') || text.includes('Failed');
    },
    undefined,
    { timeout: 60_000 },
  )
  .catch(() => {});
const taskShot = await shot('03-task');
const taskText = await page.locator('body').innerText().catch(() => '');

await browser.close();

// Server-side confirmation. The browser showing "Completed" is the frontend's
// reading of the task; the task's own event stream is the backend's, and only
// the second proves the steps executed rather than merely being accepted.
let events = [];
let status;
if (taskId) {
  const response = await fetch(`${baseUrl}/api/scaffolder/v2/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${process.env.NFS_SHELL_TOKEN ?? ''}` },
  }).catch(() => null);
  if (response?.ok) {
    const task = await response.json();
    status = task.status;
  }
  const eventsResponse = await fetch(
    `${baseUrl}/api/scaffolder/v2/tasks/${taskId}/events`,
    { headers: { Authorization: `Bearer ${process.env.NFS_SHELL_TOKEN ?? ''}` } },
  ).catch(() => null);
  if (eventsResponse?.ok) {
    events = await eventsResponse.json().catch(() => []);
  }
}

const logLines = (Array.isArray(events) ? events : [])
  .map(e => e?.body?.message)
  .filter(Boolean);
const echoedInput = logLines.some(line => String(line).includes(inputName));

const result = {
  baseUrl,
  templateName,
  inputName,
  advancedSteps: advanced,
  filledFields: filled,
  submitted,
  taskId: taskId ?? null,
  taskStatus: status ?? null,
  browserSaysCompleted: taskText.includes('Completed'),
  browserSaysFailed: taskText.includes('Failed'),
  echoedInputInServerLog: echoedInput,
  serverLogLines: logLines.slice(0, 40),
  shots: { wizard: wizardShot, review: reviewShot, task: taskShot },
  pageErrors,
  consoleErrors,
};
const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
// eslint-disable-next-line no-console
console.log(JSON.stringify(result, null, 2));

if (!submitted || !taskId || result.browserSaysFailed) {
  process.exitCode = 1;
}
