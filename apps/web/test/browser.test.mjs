import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
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
    plugins: [tailwindcss()],
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: {
      host: '127.0.0.1',
      port: 0,
      proxy: {
        '/v1/sessions': { target: `http://127.0.0.1:${api.address().port}` },
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
  const context = await browser.newContext({
    viewport,
    reducedMotion: 'reduce',
  });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.route('**/v1/sessions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        sessionToken: 'x'.repeat(43),
        role: 'admin',
        customerIds: [],
      }),
    }),
  );
  await page.goto(`http://127.0.0.1:${web.httpServer.address().port}`);
  await page.getByLabel('Username').fill('synthetic_admin');
  await page.getByLabel('Password').fill('synthetic_password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Hide request panel' }).waitFor();
  return page;
}
async function complete(page) {
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page.getByRole('article', { name: 'Executive answer' }).waitFor();
}
async function assertNoHorizontalOverflow(page) {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    width: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > window.innerWidth + 1,
      )
      .slice(0, 8)
      .map((element) => `${element.tagName}.${element.className}`),
  }));
  assert.ok(layout.width <= layout.viewport, JSON.stringify(layout));
}
test('synthetic investigation renders all answer sections and protected citations', async (t) => {
  const page = await pageForTest(t);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  assert.equal(await page.title(), 'MRR analysis');
  assert.equal(
    await page
      .getByText(
        /Northstar|Understand your MRR movement|Synthetic data|01 \/ REQUEST|02 \/ RESULT/i,
      )
      .count(),
    0,
  );
  await complete(page);
  assert.equal(await page.getByText('Completed', { exact: true }).count(), 0);
  const requestBox = await page.locator('.request-panel').boundingBox();
  const resultBox = await page.locator('.results').boundingBox();
  assert.ok(requestBox.x < resultBox.x);
  assert.ok(requestBox.width >= 320);
  await page.getByText('Sources & limitations').click();
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
test('synthetic customer churn follow-up shows retained 1 / 4 and inspectable citation', async (t) => {
  const page = await pageForTest(t);
  await complete(page);
  await page.getByRole('button', { name: 'Calculate customer churn' }).click();
  await page.getByText('1 customer churned / 4 starting customers').waitFor();
  assert.equal(await page.getByText('25%', { exact: true }).count(), 1);
  await page
    .getByRole('button', { name: /^Inspect churn evidence/ })
    .last()
    .click();
  await page.getByRole('heading', { name: 'Evidence detail' }).waitFor();
  await page.getByText('View structured values', { exact: true }).click();
  await page.getByText(/customer_churn_rate = churned_customers/).waitFor();
  assert.match(
    await page.locator('#evidence-detail').textContent(),
    /customer_churn_rate/,
  );
  await assertNoHorizontalOverflow(page);
});
test('header control hides the left panel fully and restores its form state', async (t) => {
  const page = await pageForTest(t);
  assert.equal(
    await page
      .locator('.topbar')
      .getByRole('button', { name: 'Hide request panel' })
      .count(),
    1,
  );
  assert.equal(await page.locator('.panel-rail').count(), 0);
  assert.equal(
    await page
      .locator('.primary-button')
      .evaluate((button) => getComputedStyle(button).backgroundColor),
    'rgb(200, 213, 187)',
  );
  await page.getByLabel('Customer IDs (optional)').fill('cust_acme');
  const expandedResult = await page.locator('.empty-state').boundingBox();
  await page.getByRole('button', { name: 'Hide request panel' }).click();
  assert.equal(await page.locator('.request-panel').isVisible(), false);
  assert.equal(
    await page
      .getByRole('textbox', { name: 'Customer IDs (optional)' })
      .count(),
    0,
  );
  const collapsedResult = await page.locator('.empty-state').boundingBox();
  assert.ok(collapsedResult.width > expandedResult.width);
  await page.screenshot({ path: '/tmp/executive-bi-panel-collapsed.png' });
  await page.getByRole('button', { name: 'Show request panel' }).click();
  assert.equal(
    await page.getByLabel('Customer IDs (optional)').inputValue(),
    'cust_acme',
  );
  await assertNoHorizontalOverflow(page);
  const mobile = await pageForTest(t, { width: 390, height: 844 });
  await mobile.getByRole('button', { name: 'Hide request panel' }).click();
  assert.equal(await mobile.locator('.request-panel').isVisible(), false);
  await assertNoHorizontalOverflow(mobile);
  await mobile.getByRole('button', { name: 'Show request panel' }).click();
  assert.equal(await mobile.getByLabel('Reporting month').isVisible(), true);
});
test('invalid scope and missing comparison data show recoverable outcomes', async (t) => {
  const page = await pageForTest(t);
  await page.getByLabel('Customer IDs (optional)').fill('cust_acme, cust_acme');
  await page
    .getByRole('button', { name: 'Investigate MRR', exact: true })
    .click();
  await page.getByRole('status').filter({ hasText: '50 unique' }).waitFor();
  await page.getByLabel('Customer IDs (optional)').fill('');
  await page.getByLabel('Reporting month').fill('2026-05');
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
  await assertNoHorizontalOverflow(page);
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

test('malformed answers fail closed and document Markdown renders safely with its source available', async (t) => {
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
  await page.route('**/answer', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.answer.context[0].text =
      '# August sales review\n\n**Synthetic context** with source formatting.';
    await route.fulfill({ response, json: body });
  });
  await complete(page);
  assert.equal(
    await page.getByRole('heading', { name: 'August sales review' }).count(),
    1,
  );
  assert.equal(
    await page.locator('.context-claim strong').textContent(),
    'Synthetic context',
  );
  assert.equal(
    await page.getByRole('button', { name: /^Inspect source excerpt/ }).count(),
    1,
  );
  await page.route('**/evidence/**', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.evidence.content = {
      excerpt: '<img src=x onerror="window.injected=true">',
    };
    await route.fulfill({ response, json: body });
  });
  await page.getByRole('button', { name: /^Inspect source excerpt/ }).click();
  await page
    .getByRole('heading', {
      name: 'Supporting values or document excerpt',
    })
    .waitFor();
  assert.match(
    await page.locator('#evidence-detail').textContent(),
    /<img src=x/,
  );
  assert.equal(await page.locator('#evidence-detail img').count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page
    .locator('#evidence-detail')
    .getByText('View original excerpt', { exact: true })
    .click();
  assert.match(
    await page.locator('#evidence-detail').textContent(),
    /<img src=x/,
  );
});

test('synthetic chart and retained trail support scoped values and keyboard inspection', async (t) => {
  const page = await pageForTest(t, { width: 390, height: 844 });
  await page.getByLabel('Customer IDs (optional)').fill('cust_riviera');
  await complete(page);
  assert.equal(
    await page.locator('.waterfall-section svg .chart-gridline').count(),
    5,
  );
  assert.equal(
    await page.locator('.waterfall-section svg .chart-connector').count(),
    5,
  );
  const table = page.getByRole('table', { name: 'Plan MRR values (EUR)' });
  assert.match(await table.textContent(), /EUR 300.00/);
  assert.doesNotMatch(await table.textContent(), /2500.00/);
  const inspect = page.getByRole('button', {
    name: 'Inspect chart evidence',
    exact: true,
  });
  await inspect.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  assert.match(await page.locator('#evidence-detail').textContent(), /by:plan/);
  const summary = page.getByText('How this answer was generated');
  await summary.focus();
  await page.keyboard.press('Enter');
  const trail = page.locator('.trail-details');
  assert.equal(await trail.getAttribute('open'), '');
  assert.equal(await trail.locator('ol li').count(), 5);
  assert.match(await trail.textContent(), /completed/);
  await page
    .getByRole('button', { name: /^Inspect trail / })
    .first()
    .click();
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  await assertNoHorizontalOverflow(page);
});

test('synthetic incomplete and unavailable charts retain the executive answer', async (t) => {
  const page = await pageForTest(t);
  await page.route('**/answer', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.answer.chart.reconciles = false;
    body.answer.chart.unassignedMrrEurCents = 100;
    await route.fulfill({ response, json: body });
  });
  await complete(page);
  assert.match(
    await page
      .getByRole('table', { name: 'Plan MRR values (EUR)' })
      .textContent(),
    /UnassignedEUR 1.00/,
  );
  assert.match(
    await page.getByRole('article').textContent(),
    /Incomplete breakdown/,
  );
  await page.unroute('**/answer');
  await page.route('**/answer', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.answer.chart;
    await route.fulfill({ response, json: body });
  });
  await complete(page);
  assert.equal(
    await page.getByRole('table', { name: 'Plan MRR values (EUR)' }).count(),
    0,
  );
  assert.match(
    await page.getByRole('article').textContent(),
    /chart unavailable/,
  );
});

test('natural-language review preserves selected customer scope and handles clarification', async (t) => {
  const page = await pageForTest(t);
  let starts = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/mrr-decline')) starts++;
  });
  await page.getByLabel('Customer IDs (optional)').fill('cust_acme');
  await page
    .getByLabel('Question optional')
    .fill('Why did MRR fall in August?');
  await page.getByRole('button', { name: 'Resolve question' }).click();
  await page.getByRole('status').filter({ hasText: 'Which year' }).waitFor();
  assert.equal(starts, 0);
  await page
    .getByLabel('Question optional')
    .fill('Why did MRR fall in August 2026 in Germany?');
  await page.getByRole('button', { name: 'Resolve question' }).click();
  await page.getByRole('status').filter({ hasText: 'not supported' }).waitFor();
  assert.equal(starts, 0);
  await page.getByLabel('Reporting month').fill('2026-07');
  await page
    .getByLabel('Question optional')
    .fill('Why did MRR fall in August 2026?');
  await page.getByRole('button', { name: 'Resolve question' }).click();
  await page.getByRole('status').filter({ hasText: 'Resolved MRR' }).waitFor();
  assert.equal(
    await page.getByLabel('Reporting month').inputValue(),
    '2026-08',
  );
  assert.equal(
    await page.getByLabel('Customer IDs (optional)').inputValue(),
    'cust_acme',
  );
  assert.equal(starts, 0);
  await complete(page);
  assert.match(
    await page.locator('.scope').textContent(),
    /Customers: cust_acme/,
  );
  assert.equal(starts, 1);
});

test('country follow-up action and bounded phrase show compared values and protected evidence on mobile', async (t) => {
  const page = await pageForTest(t, { width: 390, height: 844 });
  await complete(page);
  await page
    .getByRole('button', { name: 'Break down by country', exact: true })
    .click();
  await page
    .getByRole('table', { name: 'Country MRR comparison (EUR)' })
    .waitFor();
  const table = page.getByRole('table', {
    name: 'Country MRR comparison (EUR)',
  });
  assert.match(await table.textContent(), /Previous MRR.*Current MRR.*Change/);
  assert.match(await table.textContent(), /EUR -1700.00/);
  await assertNoHorizontalOverflow(page);
  const requestPromise = page.waitForRequest((request) =>
    request.url().includes('/evidence/'),
  );
  await page
    .getByRole('button', { name: 'Inspect country total', exact: true })
    .click();
  const request = await requestPromise;
  assert.match(request.headers().authorization, /^Bearer /);
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  assert.match(
    await page.locator('#evidence-detail').textContent(),
    /country_change/,
  );
  await page.getByText('Use a follow-up question').click();
  await page
    .getByLabel('Follow-up question', { exact: true })
    .fill('Break that down by country in September 2026');
  await page
    .getByRole('button', { name: 'Run follow-up', exact: true })
    .click();
  await page
    .getByRole('status')
    .filter({ hasText: 'Only “Break that down by country”' })
    .waitFor();
  assert.equal(await table.count(), 0);
  await page
    .getByLabel('Follow-up question', { exact: true })
    .fill('Break that down by country');
  await page
    .getByRole('button', { name: 'Run follow-up', exact: true })
    .click();
  await table.waitFor();
  assert.match(
    await page.getByRole('article').textContent(),
    /not churn or acquisition/,
  );
  await page.screenshot({
    path: '/tmp/executive-bi-country-mobile.png',
    fullPage: true,
  });
});

test('synthetic country account drill-down shows cited contributions and uses a separate in-memory token on mobile', async (t) => {
  const page = await pageForTest(t, { width: 390, height: 844 });
  await complete(page);
  await page
    .getByRole('button', { name: 'Break down by country', exact: true })
    .click();
  const action = page.getByRole('button', {
    name: 'Show accounts for DE',
    exact: true,
  });
  await action.waitFor();
  const createPromise = page.waitForResponse((response) =>
    response.url().endsWith('/customer-follow-ups'),
  );
  await action.click();
  const created = await (await createPromise).json();
  await page
    .getByRole('status')
    .filter({ hasText: 'Customer drill-down complete.' })
    .waitFor();
  const table = page.getByRole('table', {
    name: 'Five largest negative customer contributions (EUR)',
  });
  assert.match(await table.textContent(), /cust_acme.*EUR -2400.00/);
  const section = page.locator('#customer-drilldown');
  assert.match(
    await section.textContent(),
    /Positive offsets.*Remaining net movement.*Country net movement/s,
  );
  const evidencePromise = page.waitForRequest((request) =>
    request.url().includes('/evidence/'),
  );
  await section
    .getByRole('button', { name: /^Inspect contribution / })
    .first()
    .click();
  const evidence = await evidencePromise;
  assert.equal(
    evidence.headers().authorization,
    `Bearer ${created.accessToken}`,
  );
  await page
    .getByRole('heading', { name: 'Supporting values or document excerpt' })
    .waitFor();
  assert.match(
    await page.locator('#evidence-detail').textContent(),
    /customer_country_change/,
  );
  assert.equal(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  await assertNoHorizontalOverflow(page);
  await page.screenshot({
    path: '/tmp/executive-bi-customer-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Break down by country', exact: true })
    .click();
  await action.waitFor();
  assert.equal(await table.count(), 0);
  await page.route('**/customer-follow-ups', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await action.click();
  await section
    .getByRole('status')
    .filter({ hasText: 'unavailable' })
    .waitFor();
  assert.equal(await action.isEnabled(), true);
});

test('synthetic account drill-down announces empty losses and retained blocked results', async (t) => {
  const page = await pageForTest(t);
  await complete(page);
  await page
    .getByRole('button', { name: 'Break down by country', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Show accounts for SE', exact: true })
    .click();
  const section = page.locator('#customer-drilldown');
  await section
    .getByText('No negative customer contributions in this country.')
    .waitFor();
  await page.route('**/customer-follow-ups', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.status = 'blocked';
    body.record.status = 'blocked';
    body.warnings = ['synthetic_changed_totals'];
    await route.fulfill({ status: 422, json: body });
  });
  await page
    .getByRole('button', { name: 'Show accounts for DE', exact: true })
    .click();
  await section
    .getByRole('status')
    .filter({ hasText: 'Retained record:' })
    .waitFor();
  assert.equal(await section.getByRole('table').count(), 0);
  assert.equal(
    await page.getByRole('article', { name: 'Executive answer' }).count(),
    1,
  );
});

test('cross-source journey retains country scope and cites operational records on mobile', async (t) => {
  const page = await pageForTest(t, { width: 390, height: 844 });
  await complete(page);
  await page
    .getByRole('heading', { name: 'Revenue movement waterfall', exact: true })
    .waitFor();
  await page
    .getByRole('button', { name: 'Break down by country', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Show accounts for DE', exact: true })
    .click();
  await page
    .locator('#customer-drilldown')
    .getByText('cust_acme', { exact: true })
    .waitFor();
  await page
    .getByRole('button', {
      name: 'Investigate revenue losses across sources',
      exact: true,
    })
    .click();
  const section = page.getByRole('region', {
    name: 'Cross-source revenue investigation',
  });
  await section
    .getByRole('heading', { name: 'crm evidence', exact: true })
    .waitFor();
  assert.match(await section.textContent(), /Accounts: cust_acme/);
  assert.match(await section.textContent(), /budget_frozen/);
  assert.match(await section.textContent(), /conflict/);
  await section
    .getByRole('button', {
      name: 'Inspect support query evidence',
      exact: true,
    })
    .click();
  await page
    .locator('#evidence-detail')
    .getByText(/synthetic_ops_query/)
    .waitFor();
  await page.screenshot({
    path: '/tmp/executive-bi-cross-source-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
});
test('sign-out clears retained answers and requires another sign-in', async (t) => {
  const page = await pageForTest(t);
  await complete(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  await page.getByLabel('Username').fill('synthetic_admin');
  await page.getByLabel('Password').fill('synthetic_password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Hide request panel' }).waitFor();
  assert.equal(
    await page.getByRole('article', { name: 'Executive answer' }).count(),
    0,
  );
});
