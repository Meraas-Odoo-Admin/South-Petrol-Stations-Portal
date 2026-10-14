import { mkdirSync } from 'fs';
import path from 'path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { loadFixtures, loginAs, navigateInApp } from './helpers';
import { FAKE_CAMERA_PATH } from './global-setup';

// Phase 6 browser pass: the card-only pump flow, the activation switch and an
// office without a stock tab. Screenshots (desktop and 390 px) go to
// docs/ux-round-screenshots/phase6-ui. The fake camera streams the fixture
// card; nothing is recorded here (the scan spec records the fill-up).
const fixtures = loadFixtures();
const SHOTS = path.resolve(process.cwd(), '..', '..', 'docs', 'ux-round-screenshots', 'phase6-ui');
mkdirSync(SHOTS, { recursive: true });

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${FAKE_CAMERA_PATH}`,
    ],
  },
});

async function shots(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

test('pump: scan, confirm, fuel and amount, review (not submitted)', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).first().click();
  await expect(page).toHaveURL('/fillups/new');

  await expect(page.getByTestId('fillup-scan-confirm')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('fillup-type-plate-instead')).toHaveCount(0);
  await shots(page, '01-pump-confirm-vehicle');

  await page.getByTestId('fillup-scan-confirm-yes').click();
  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await shots(page, '02-pump-fuel-and-amount');

  await page.getByTestId('fillup-mobile-continue-to-review').click();
  await expect(page.getByTestId('rule-review-card-mobile')).toBeVisible();
  await shots(page, '03-pump-review');
  await context.close();
});

test('super admin: the activation switch on the municipality page', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);
  await navigateInApp(page, `/admin/municipalities/${fixtures.municipalityId}`);
  await page.getByTestId('tab-settings').click();
  const state = page.getByTestId('municipality-activation-state');
  await expect(state).toBeVisible();
  await expect(state).toContainText('مفعّلة منذ');
  await expect(page.getByTestId('municipality-stage-' + fixtures.municipalityId)).toHaveCount(0);
  await shots(page, '04-activation-switch');

  // Switching off asks for a reason; the dialog is opened and left again.
  await page.getByTestId('municipality-deactivate-open').click();
  await expect(page.getByTestId('municipality-deactivate-confirm-button')).toBeDisabled();
  await shots(page, '05-activation-switch-off-dialog');
  await page.keyboard.press('Escape');
  await context.close();
});

test('office manager: the office page has no stock tab', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, fixtures.officeManagerUsername, fixtures.officeManagerPassword);
  await page.getByRole('link', { name: 'مكتبي' }).first().click();
  await expect(page.getByTestId('tab-overview')).toBeVisible();
  await expect(page.getByTestId('tab-cards')).toHaveCount(0);
  await expect(page.getByText('البطاقات والمخزون')).toHaveCount(0);
  await shots(page, '06-office-without-stock-tab');
  await context.close();
});
