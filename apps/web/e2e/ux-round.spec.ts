import { mkdirSync } from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { loadFixtures, loginAs, navigateInApp } from './helpers';

// UX round: the municipality page in tabs with paged lists, the bell panel kept
// inside the screen, exactly one active menu item, and the cross-office card
// reprint. Screenshots (desktop and 390 px) go to docs/ux-round-screenshots/
// <UX_SHOTS or "after">.
const fixtures = loadFixtures();
const SHOTS = path.resolve(process.cwd(), '..', '..', 'docs', 'ux-round-screenshots', process.env.UX_SHOTS ?? 'after');
mkdirSync(SHOTS, { recursive: true });

async function shots(page: Page, name: string, fullPage = true) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage });
  await page.setViewportSize({ width: 1280, height: 900 });
}

test.describe.configure({ mode: 'serial' });

test('municipality page: six tabs, a paged list, one report at a time, a danger zone', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);
  await navigateInApp(page, `/admin/municipalities/${fixtures.municipalityId}`);

  // The six tabs, and the active one is in the address.
  for (const key of ['overview', 'places', 'people', 'reports', 'activity', 'settings']) {
    await expect(page.getByTestId(`tab-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId('municipality-counts')).toBeVisible();
  await shots(page, '01-municipality-overview');

  // المحطات والمكاتب: Phase 7 - two tabs, each a paged list with the total.
  await page.getByTestId('tab-stations').click();
  await expect(page).toHaveURL(/tab=stations/);
  await expect(page.getByTestId('stations-list')).toBeVisible();
  const range = page.getByTestId('stations-list-pager-range');
  await expect(range).toContainText('من');
  const rows = page.locator('[data-testid="stations-list"] tbody tr');
  expect(await rows.count()).toBeLessThanOrEqual(10);
  await shots(page, '02-municipality-places');

  // Page 2 (when there is one) is in the address and survives a refresh.
  const next = page.getByTestId('stations-list-pager-next');
  if (await next.count()) {
    await next.click();
    await expect(page).toHaveURL(/page=2/);
    await page.reload();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('stations-list')).toBeVisible();
    await shots(page, '03-municipality-places-page-2');
  }

  // Search narrows on the server.
  await page.getByLabel('بحث باسم المحطة أو رمزها أو رقمها').fill(fixtures.stationName);
  await expect(page.getByRole('link', { name: fixtures.stationName }).first()).toBeVisible();

  // The offices tab: its own list, with only offices in it.
  await page.getByTestId('tab-offices').click();
  await expect(page).toHaveURL(/kind=offices/);
  await expect(page).toHaveURL(/tab=stations/);
  await expect(page.getByTestId('offices-list')).toBeVisible();
  await expect(page.getByTestId('stations-list')).toHaveCount(0);

  await page.getByTestId('tab-people').click();
  await expect(page.getByTestId('people-list')).toBeVisible();
  await expect(page).not.toHaveURL(/page=/); // a new tab starts on its first page
  await shots(page, '04-municipality-people');

  // التقارير: one table at a time.
  await page.getByTestId('tab-reports').click();
  await expect(page.getByTestId('municipality-reports')).toBeVisible();
  await expect(page.getByTestId('ops-report-chooser')).toBeVisible();
  await expect(page.locator('[data-testid^="ops-table-"]')).toHaveCount(1);
  await shots(page, '05-municipality-reports');

  await page.getByTestId('tab-activity').click();
  await expect(page.getByTestId('activity-list')).toBeVisible();
  await shots(page, '06-municipality-activity');

  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('municipality-danger-zone')).toBeVisible();
  await shots(page, '07-municipality-settings');
  await context.close();
});

test('«إدارة المحطات»: stations and offices in two paged lists', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);
  await navigateInApp(page, '/manage');
  await expect(page.getByTestId('stations-list')).toBeVisible();
  await expect(page.getByTestId('stations-list-pager-range')).toContainText('من');
  await expect(page.getByTestId('stations-list-add')).toBeVisible();
  await shots(page, '10-manage-places');
  // After review (21 Oct 2026): «إدارة مكاتب التسجيل» is its own page.
  await navigateInApp(page, '/manage/offices');
  await expect(page.getByTestId('offices-list')).toBeVisible();
  await expect(page.getByTestId('offices-list-add')).toBeVisible();
  await context.close();
});

test('the menu highlights exactly one item, and the bell stays inside the screen', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  for (const [route, shot] of [
    ['/reports/daily', '20-nav-daily'],
    ['/reports/violations', '21-nav-violations'],
  ] as const) {
    await navigateInApp(page, route);
    await expect(page.locator('aside nav a[aria-current="page"]')).toHaveCount(1);
    await shots(page, shot, false);
  }

  // The bell panel is entirely inside the viewport, on a desktop and a phone.
  await navigateInApp(page, '/');
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('[data-testid="notification-bell"]:visible').click();
    const panel = page.getByTestId('notification-panel');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
    await page.screenshot({ path: path.join(SHOTS, `30-bell-${viewport.width}.png`) });
    // No raw values in any notification.
    const text = await panel.innerText();
    expect(text).not.toMatch(/←|\btrue\b|\bfalse\b/);
    await page.keyboard.press('Escape');
  }
  await context.close();
});

test('the daily report chart and a violation row', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await navigateInApp(page, '/reports/daily');
  await page.waitForTimeout(800);
  await shots(page, '40-daily-chart');
  await navigateInApp(page, '/reports/violations');
  await page.waitForTimeout(800);
  const dates = await page.locator('main').innerText();
  expect(dates).not.toMatch(/\d{1,2}p\s+\d/); // the garbled «13p 3:32:21 ،2026/10/»
  await shots(page, '41-violations-row');
  await context.close();
});

test('a registration employee reprints a card from the vehicle page', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.registrarUsername, fixtures.registrarPassword);
  await navigateInApp(page, `/vehicles/${fixtures.vehicleId}`);
  await expect(page.getByTestId('vehicle-card-panel')).toBeVisible();
  const reprint = page.getByTestId('vehicle-card-reprint');
  if (await reprint.count()) {
    await reprint.click();
    // It prints at the employee's office (Phase 7: no desk to pick).
    await page.waitForTimeout(600);
  }
  await shots(page, '50-card-reprint');
  await context.close();
});

// Root cause of the phone-spec flake: the vehicles list reset its page 300 ms
// after mounting, and since the page lives in the address that reset NAVIGATED
// to /vehicles - landing on top of the route the person had just moved on to.
// The leave is timed (inside the page) to fire just before that 300 ms timer, so
// the two land in the same moment, as they did in the flaky run.
test('leaving the vehicles list as it settles stays where you went', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await navigateInApp(page, '/reports');
    await page.waitForTimeout(400);
    await page.evaluate(`new Promise((resolve) => {
      const leave = () => {
        window.history.pushState({}, '', '/reports');
        window.dispatchEvent(new PopStateEvent('popstate'));
        resolve(true);
      };
      const observer = new MutationObserver(() => {
        if (document.querySelector('main h1')?.textContent?.includes('المركبات')) {
          observer.disconnect();
          setTimeout(leave, 296 + ${attempt % 4});
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      window.history.pushState({}, '', '/vehicles');
      window.dispatchEvent(new PopStateEvent('popstate'));
    })`);
    await page.waitForTimeout(800);
    await expect(page, 'attempt ' + attempt).toHaveURL('/reports');
  }
  await context.close();
});
