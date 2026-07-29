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

const waitForResponse = predicate =>
  page
    .waitForResponse(predicate, { timeout: 15_000 })
    .catch(() => null);

const remotesResponsePromise = waitForResponse(response =>
  response.url().includes('/.backstage/dynamic-features/remotes'),
);
const manifestResponsePromise = waitForResponse(response =>
  response.url().includes('mf-manifest.json'),
);
const remoteEntryResponsePromise = waitForResponse(response =>
  response.url().includes('remoteEntry.js'),
);

page.on('request', request => requests.push(request.url()));
page.on('pageerror', error => pageErrors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

let navigationError;
try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  const enterButton = page.getByRole('button', { name: /^enter$/i }).first();
  const guestButtonVisible = await enterButton
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (guestButtonVisible) {
    await enterButton.click();
    await page.waitForFunction(
      () => !document.body?.innerText.includes('Enter as a Guest User.'),
      undefined,
      { timeout: 10_000 },
    );
    guestSignIn = true;
  }
  await page.goto(`${baseUrl}${entityPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      document.body?.innerText.includes('Your Clusters') ||
      document.body?.innerText.includes('No Kubernetes resources'),
    undefined,
    { timeout: 15_000 },
  );
} catch (error) {
  navigationError = String(error);
}

const bodyText = await page.locator('body').innerText().catch(() => '');
const staticDiscovery = await page
  .evaluate(() => {
    const discovered = window['__@backstage/discovered__'];
    return Array.isArray(discovered?.modules)
      ? discovered.modules.map(module => module.name)
      : [];
  })
  .catch(() => []);
const [remotesResponse, manifestResponse, remoteEntryResponse] =
  await Promise.all([
    remotesResponsePromise,
    manifestResponsePromise,
    remoteEntryResponsePromise,
  ]);
const responseSucceeded = response => Boolean(response?.ok());
const remotesFetch = await page
  .evaluate(async () => {
    const response = await fetch('/.backstage/dynamic-features/remotes');
    return {
      ok: response.ok,
      remotes: response.ok ? await response.json() : [],
    };
  })
  .catch(() => ({ ok: false, remotes: [] }));
const remotes = Array.isArray(remotesFetch.remotes)
  ? remotesFetch.remotes
  : [];
const kubernetesRemoteAdvertised = Array.isArray(remotes)
  ? remotes.some(remote =>
      String(remote.packageName ?? '').includes('plugin-kubernetes'),
    )
  : false;
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
    loaderRemotesResponseOk:
      remotesFetch.ok && responseSucceeded(remotesResponse),
    moduleFederationManifestLoaded: responseSucceeded(manifestResponse),
    moduleFederationRemoteEntryLoaded: responseSucceeded(remoteEntryResponse),
    kubernetesRemoteAdvertised,
    catalogStaticallyDiscovered: staticDiscovery.includes(
      '@backstage/plugin-catalog',
    ),
    kubernetesStaticallyAbsent: !staticDiscovery.includes(
      '@backstage/plugin-kubernetes',
    ),
    kubernetesReferenceRendered:
      bodyText.includes('Your Clusters') ||
      bodyText.includes('No Kubernetes resources'),
    pageErrors: pageErrors.length === 0,
    consoleErrors: consoleErrors.length === 0,
  },
  staticDiscovery,
  remotes,
  navigationError,
  pageErrors,
  consoleErrors,
  bodyExcerpt: bodyText.slice(0, 1200),
};

console.log(JSON.stringify(result, null, 2));

const requiredChecks = [
  'loaderRemotesRequested',
  'loaderRemotesResponseOk',
  'kubernetesRemoteAdvertised',
  'moduleFederationManifestRequested',
  'moduleFederationManifestLoaded',
  'moduleFederationRemoteEntryRequested',
  'moduleFederationRemoteEntryLoaded',
  'catalogStaticallyDiscovered',
  'kubernetesStaticallyAbsent',
  'kubernetesReferenceRendered',
  'pageErrors',
  'consoleErrors',
];
if (navigationError || requiredChecks.some(check => !result.checks[check])) {
  process.exitCode = 1;
}
