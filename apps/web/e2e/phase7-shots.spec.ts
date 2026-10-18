import { mkdirSync } from 'fs';
import path from 'path';
import { test, type Browser, type Page } from '@playwright/test';
import { loadFixtures, loginAs, navigateInApp, submitLogin } from './helpers';

// Phase 7: before/after screenshots of every review item, desktop and 390 px.
// Only runs when PHASE7_SHOTS is set ("before" or "after"); the folder is
// docs/ux-round-screenshots/phase7/<PHASE7_SHOTS>. Best effort on purpose: a
// screen that changed shape between the two runs still gets its picture, so
// nothing here asserts behaviour (phase7.spec.ts does that).
const MODE = process.env.PHASE7_SHOTS;
test.skip(!MODE, 'screenshots only: set PHASE7_SHOTS=before|after');

const fixtures = MODE ? loadFixtures() : (undefined as never);
const SHOTS = path.resolve(process.cwd(), '..', '..', 'docs', 'ux-round-screenshots', 'phase7', MODE ?? 'unused');
if (MODE) mkdirSync(SHOTS, { recursive: true });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(page: Page, name: string, both = true) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage: true });
  if (both) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
}

// The viewport only (not the full page), for a popup that must stay on screen.
async function viewportShot(page: Page, name: string) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function weakScreen(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addStyleTag({ content: 'html{filter:contrast(0.8) brightness(0.88)}' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, `weak-${name}.png`), fullPage: true });
  await page.evaluate(
    "document.querySelectorAll('style').forEach((s) => { if (s.textContent && s.textContent.startsWith('html{filter')) s.remove(); })",
  );
}

async function step(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.warn(`[phase7-shots] ${label}: ${(error as Error).message.split('\n')[0]}`);
  }
}

async function open(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

async function visit(page: Page, route: string) {
  await navigateInApp(page, route);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(500);
}

test('login and forced password change: the password fields (4.5)', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await page.goto('/login');
  await step('login', () => shot(page, 'p45-login-password'));
  await step('change password', async () => {
    await submitLogin(page, fixtures.needsChangeUsername, fixtures.needsChangePassword);
    await page.waitForURL('**/change-password');
    await shot(page, 'p45-change-password');
  });
  await context.close();
});

test('registration employee: fields, plate change, card desk (1.x, 3.1, 8)', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.registrarUsername, fixtures.registrarPassword);
  await step('registration', async () => {
    await visit(page, '/registration');
    await shot(page, 'p1-registration-form');
  });
  await step('registration, administrative number', async () => {
    await page.getByRole('button', { name: /رقم إداري|الرقم الإداري/ }).first().click();
    await shot(page, 'p11-registration-administrative-number');
  });
  await step('plate change', async () => {
    await visit(page, `/vehicles/${fixtures.vehicleId}`);
    // After review (18 Oct 2026): «تعديل» edits every field; no change requests.
    await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
    await shot(page, 'p16-plate-change');
  });
  await step('vehicles list loading (skeleton)', async () => {
    await page.route('**/api/v1/vehicles?**', async (route) => {
      await sleep(4000);
      await route.continue().catch(() => undefined);
    });
    await navigateInApp(page, '/vehicles');
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS, 'p8-vehicles-loading-desktop.png') });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
  await step('card issue (desk picker)', async () => {
    await visit(page, '/vehicles');
    await page.getByPlaceholder(/بحث|ابحث/).first().fill(fixtures.cleanVehicleCurrentPlate);
    await page.waitForTimeout(1500);
    await page.getByText(/^V-\d+$/).first().click();
    await page.waitForURL(/\/vehicles\/[^/]+$/);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: /إصدار البطاقة|إصدار بطاقة/ }).first().click();
    await page.waitForTimeout(1000);
    await shot(page, 'p31-card-issue');
  });
  await context.close();
});

test('station supervisor: pump and no-card fallback (2, 8)', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await step('pump', async () => {
    await visit(page, '/fillups/new');
    await shot(page, 'p8-pump');
  });
  await step('no-card fallback', async () => {
    await page.getByTestId('fillup-nocard-open').click();
    await shot(page, 'p2-pump-nocard');
  });
  await step('exceptions', async () => {
    await visit(page, '/reports/violations');
    await shot(page, 'p2-exceptions-list');
  });
  await context.close();
});

test('municipality manager: the day, dates, places, lists, cards (3.2, 4.1-4.3, 5, 6.5)', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);
  await step('the day', async () => {
    await visit(page, '/reports/daily');
    await page.waitForTimeout(1500);
    await shot(page, 'p41-p42-manager-day');
  });
  await step('date picker, desktop', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const pickers = page.locator('button[aria-label*="التقويم"], button[aria-label*="تقويم"]');
    await pickers.last().scrollIntoViewIfNeeded();
    await pickers.last().click();
    await viewportShot(page, 'p43-date-picker-desktop');
    await page.keyboard.press('Escape');
  });
  await step('date picker, 390', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pickers = page.locator('button[aria-label*="التقويم"], button[aria-label*="تقويم"]');
    await pickers.last().scrollIntoViewIfNeeded();
    await pickers.last().click();
    await viewportShot(page, 'p43-date-picker-390');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 900 });
  });
  await step('manage places', async () => {
    await visit(page, '/manage');
    await shot(page, 'p5-manage-places');
    await weakScreen(page, 'manage-places');
  });
  await step('manage places, offices tab (after)', async () => {
    await page.getByTestId('tab-offices').click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await shot(page, 'p5-manage-offices');
  });
  await step('lists', async () => {
    await visit(page, MODE === 'before' ? '/lists' : '/admin/lists');
    await shot(page, 'p65-lists');
  });
  await step('manager on a vehicle (card issue)', async () => {
    await visit(page, `/vehicles/${fixtures.vehicleId}`);
    await shot(page, 'p32-manager-vehicle');
  });
  await step('manager registration', async () => {
    await visit(page, '/registration');
    await shot(page, 'p32-manager-registration');
  });
  await context.close();
});

test('office manager: the office tabs and desks (3.1, 4.4)', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.officeManagerUsername, fixtures.officeManagerPassword);
  await step('my office', async () => {
    await visit(page, '/my-office');
    await shot(page, 'p44-office-tabs');
  });
  // The desks tab exists only before Phase 7.
  if (MODE === 'before') await step('desks tab', async () => {
    await page.getByTestId('tab-desks').click();
    await shot(page, 'p31-office-desks');
  });
  await context.close();
});

test('super admin: municipality tabs, settings, lists (4.4, 5, 6, 7)', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await open(browser);
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);
  await step('home', async () => {
    await shot(page, 'p7-admin-home');
  });
  await step('municipality', async () => {
    await visit(page, `/admin/municipalities/${fixtures.municipalityId}`);
    await shot(page, 'p44-municipality-tabs');
  });
  await step('municipality places tab', async () => {
    await page.getByTestId('tab-stations').click().catch(() => page.getByRole('tab', { name: /المحطات/ }).first().click());
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await shot(page, 'p5-municipality-places');
  });
  await step('municipality places, offices tab (after)', async () => {
    await page.getByTestId('tab-offices').click();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await shot(page, 'p5-municipality-offices');
  });
  await step('settings', async () => {
    await visit(page, '/admin/settings');
    await page.waitForTimeout(800);
    await shot(page, 'p6-settings');
    await weakScreen(page, 'settings');
  });
  await step('lists', async () => {
    await visit(page, MODE === 'before' ? '/lists' : '/admin/lists');
    await shot(page, 'p65-admin-lists');
  });
  await context.close();
});
