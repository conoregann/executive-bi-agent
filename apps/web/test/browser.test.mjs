import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import {
  createSyntheticMrrDeclineApi,
  createMrrDeclineServer,
} from '@executive-bi/api';

let browser, web, api;
before(async () => {
  api = createMrrDeclineServer(await createSyntheticMrrDeclineApi());
  await new Promise((resolve, reject) => {
    api.once('error', reject);
    api.listen(0, '127.0.0.1', resolve);
  });
  web = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/v1/investigations': {
          target: `http://127.0.0.1:${api.address().port}`,
        },
      },
    },
  });
  await web.listen();
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await web?.close();
  if (api) await new Promise((resolve) => api.close(resolve));
});
async function pageForTest(t, viewport = { width: 1200, height: 900 }) {
  const context = await browser.newContext({ viewport });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(`http://127.0.0.1:${web.httpServer.address().port}`);
  return page;
}
async function complete(page) {
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page.getByRole('article', { name: 'Executive answer' }).waitFor();
}
test('synthetic investigation renders all answer sections and protected citations', async (t) => {
  const page = await pageForTest(t);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await complete(page);
  for (const name of [
    'Answer',
    'Drivers',
    'Context',
    'Limitations',
    'Evidence',
    'Recommended next step',
  ])
    assert.equal(
      await page.getByRole('heading', { name, exact: true }).count(),
      1,
    );
  assert.match(await page.getByRole('article').textContent(), /EUR -1700.00/);
  const requestPromise = page.waitForRequest((request) =>
    request.url().includes('/evidence/'),
  );
  await page
    .getByRole('button', { name: /^Inspect / })
    .first()
    .click();
  const request = await requestPromise;
  assert.match(request.headers().authorization, /^Bearer [A-Za-z0-9_-]{43}$/);
  const unauthenticated = await page.request.get(request.url());
  assert.equal(unauthenticated.status(), 401);
  const invalid = await page.request.get(request.url(), {
    headers: { authorization: `Bearer ${'x'.repeat(43)}` },
  });
  assert.equal(invalid.status(), 404);
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  assert.equal(new URL(page.url()).search, '');
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: '/tmp/executive-bi-web-desktop.png',
    fullPage: true,
  });
  await page.reload();
  assert.equal(await page.getByRole('article').count(), 0);
});
test('invalid scope and missing comparison data show recoverable outcomes', async (t) => {
  const page = await pageForTest(t);
  await page.getByLabel('Customer IDs (optional)').fill('cust_acme, cust_acme');
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page.getByRole('status').filter({ hasText: '50 unique' }).waitFor();
  await page.getByLabel('Customer IDs (optional)').fill('');
  await page.getByLabel('Reporting month').fill('2026-07');
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Investigation blocked' })
    .waitFor();
  assert.equal(await page.getByRole('article').count(), 0);
});
test('scoped answer preserves scope, mobile width and keyboard access', async (t) => {
  const page = await pageForTest(t, { width: 390, height: 844 });
  await page.getByLabel('Customer IDs (optional)').fill('cust_acme');
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page.getByRole('article').waitFor();
  assert.match(
    await page.locator('.scope').textContent(),
    /Customers: cust_acme/,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: '/tmp/executive-bi-web-mobile.png',
    fullPage: true,
  });
  const citation = page.getByRole('button', { name: /^Inspect / }).first();
  await citation.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('heading', { name: 'Evidence detail', exact: true })
      .evaluate((element) => element === document.activeElement),
    true,
  );
});
test('service and evidence failures are recoverable without stale evidence', async (t) => {
  const page = await pageForTest(t);
  await page.route('**/v1/investigations/mrr-decline', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'service unavailable' })
    .waitFor();
  await page.unroute('**/v1/investigations/mrr-decline');
  await complete(page);
  await page.route('**/evidence/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  await page
    .getByRole('button', { name: /^Inspect / })
    .first()
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Evidence unavailable' })
    .waitFor();
  assert.equal(
    await page
      .getByRole('heading', { name: 'Supporting values or document excerpt' })
      .count(),
    0,
  );
});

test('malformed answers fail closed and document markup renders as text', async (t) => {
  const page = await pageForTest(t);
  await page.route('**/answer', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"answer":{}}',
    }),
  );
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'invalid answer' })
    .waitFor();
  assert.equal(await page.getByRole('article').count(), 0);
  await page.unroute('**/answer');
  await complete(page);
  await page.route('**/evidence/**', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.evidence.content = {
      excerpt: '<img src=x onerror="window.injected=true">',
    };
    await route.fulfill({ response, json: body });
  });
  await page
    .getByRole('button', { name: /^Inspect / })
    .first()
    .click();
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  assert.match(
    await page.locator('#evidence-detail').textContent(),
    /<img src=x/,
  );
  assert.equal(await page.locator('#evidence-detail img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
});
