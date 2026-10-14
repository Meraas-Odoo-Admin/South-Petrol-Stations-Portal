import { mkdirSync } from 'fs';
import path from 'path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { loadFixtures, loginAs, navigateInApp } from './helpers';

// Phase 6, Part B: the main screens of every role, desktop and 390 px, plus the
// same key screens through a simulated poor laptop screen (contrast -20%,
// lower brightness). Screenshots go to docs/ux-round-screenshots/phase6-partB.
// One login per role: POST /auth/login is throttled.
const fixtures = loadFixtures();
const SHOTS = path.resolve(process.cwd(), '..', '..', 'docs', 'ux-round-screenshots', 'phase6-partB');
mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

// A weak laptop panel: less contrast and a dimmer picture.
async function weakScreen(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addStyleTag({ content: 'html{filter:contrast(0.8) brightness(0.88)}' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `weak-${name}.png`), fullPage: true });
  await page.evaluate("document.querySelectorAll('style').forEach((s) => { if (s.textContent && s.textContent.startsWith('html{filter')) s.remove(); })");
}

async function open(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

async function visit(page: Page, route: string, name: string, ready?: () => Promise<unknown>) {
  await navigateInApp(page, route);
  if (ready) await ready();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await shot(page, name);
}

test('station supervisor: home, pump, exceptions, the day, my station', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await shot(page, 'supervisor-01-home');
  await weakScreen(page, 'supervisor-home');
  await visit(page, '/fillups/new', 'supervisor-02-pump');
  await visit(page, '/reports/violations', 'supervisor-03-exceptions', () => expect(page.getByTestId('exceptions-table')).toBeVisible());
  await weakScreen(page, 'supervisor-exceptions');
  await visit(page, '/reports/daily', 'supervisor-04-day');
  await visit(page, '/my-station', 'supervisor-05-my-station');
  await context.close();
});

test('municipality manager: home, manage, exceptions by station, the day, lists', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);
  await shot(page, 'manager-01-home');
  await visit(page, '/manage', 'manager-02-manage');
  await visit(page, '/reports/violations?tab=stations', 'manager-03-exceptions-by-station');
  await weakScreen(page, 'manager-exceptions-by-station');
  await visit(page, '/reports/daily', 'manager-04-day');
  await visit(page, '/lists', 'manager-05-lists', () => expect(page.getByTestId('exception-types-panel')).toBeVisible());
  await context.close();
});

test('registration employee: home, registration, vehicles', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.registrarUsername, fixtures.registrarPassword);
  await shot(page, 'registrar-01-home');
  await visit(page, '/registration', 'registrar-02-registration');
  await weakScreen(page, 'registrar-registration');
  await visit(page, '/vehicles', 'registrar-03-vehicles');
  await context.close();
});

test('office manager: home, my office', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.officeManagerUsername, fixtures.officeManagerPassword);
  await shot(page, 'office-01-home');
  await visit(page, '/my-office', 'office-02-my-office');
  await context.close();
});

test('super admin: home, municipalities, settings, lists', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);
  await shot(page, 'admin-01-home');
  await visit(page, '/admin/municipalities', 'admin-02-municipalities');
  await visit(page, '/admin/settings', 'admin-03-settings', () => expect(page.getByTestId('global-exception-settings')).toBeVisible());
  await weakScreen(page, 'admin-settings');
  await visit(page, '/lists', 'admin-04-lists');
  await context.close();
});

test('the network banner appears when the server cannot be reached, and retries', async ({ browser }) => {
  test.setTimeout(120_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await navigateInApp(page, '/reports/daily');
  await page.route('**/api/v1/reports/daily**', (route) => route.abort('failed'));
  await page.getByTestId('daily-filter-nocard').check();
  await expect(page.getByTestId('network-banner')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('network-banner')).toContainText('لم يُحفظ شيء');
  await shot(page, 'supervisor-06-network-banner');
  await page.unroute('**/api/v1/reports/daily**');
  await page.getByRole('button', { name: 'إعادة المحاولة' }).click();
  await expect(page.getByTestId('network-banner')).toHaveCount(0, { timeout: 20_000 });
  await context.close();
});
