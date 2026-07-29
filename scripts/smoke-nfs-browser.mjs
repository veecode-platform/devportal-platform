import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const baseUrl = process.env.NFS_SMOKE_BASE_URL ?? 'http://localhost:7007';
const entityPath =
  process.env.NFS_SMOKE_ENTITY_PATH ??
  '/catalog/default/component/nfs-kubernetes-control/kubernetes';
const screenshotPath =
  process.env.NFS_SMOKE_SCREENSHOT ?? '/tmp/nfs-gate1-kubernetes.png';

const requests = [];
const pageErrors = [];
const consoleErrors = [];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let guestSignIn = false;

page.on('request', request => requests.push(request.url()));
page.on('pageerror', error => pageErrors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

let navigationError;
try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const enterButton = page.getByRole('button', { name: /^enter$/i }).first();
  if (await enterButton.count()) {
    await enterButton.click();
    guestSignIn = true;
    await page.waitForTimeout(2500);
  }
  await page.goto(`${baseUrl}${entityPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
} catch (error) {
  navigationError = String(error);
}

const bodyText = await page.locator('body').innerText().catch(() => '');
fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await page.screenshot({ path: screenshotPath, fullPage: true });
await browser.close();

const result = {
  baseUrl,
  entityPath,
  screenshotPath,
  guestSignIn,
  requests: requests.filter(url => url.includes('/.backstage/dynamic-features')),
  checks: {
    loaderRemotesRequested: requests.some(url =>
      url.includes('/.backstage/dynamic-features/remotes'),
    ),
    moduleFederationManifestRequested: requests.some(url =>
      url.includes('mf-manifest.json'),
    ),
    moduleFederationRemoteEntryRequested: requests.some(url =>
      url.includes('remoteEntry.js'),
    ),
    kubernetesReferenceRendered:
      bodyText.includes('Your Clusters') ||
      bodyText.includes('No Kubernetes resources'),
    pageErrors: pageErrors.length === 0,
    consoleErrors: consoleErrors.length === 0,
  },
  navigationError,
  pageErrors,
  consoleErrors,
  bodyExcerpt: bodyText.slice(0, 1200),
};

console.log(JSON.stringify(result, null, 2));

const requiredChecks = [
  'loaderRemotesRequested',
  'moduleFederationManifestRequested',
  'moduleFederationRemoteEntryRequested',
  'kubernetesReferenceRendered',
  'pageErrors',
  'consoleErrors',
];
if (navigationError || requiredChecks.some(check => !result.checks[check])) {
  process.exitCode = 1;
}
