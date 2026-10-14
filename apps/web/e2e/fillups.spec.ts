import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';
import { FAKE_CAMERA_HISTORY_PATH } from './global-setup';

const fixtures = loadFixtures();

// Phase 6: a fill-up is recorded from a CARD SCAN. This browser's fake camera
// streams the printed card of the fixture vehicle that already has a fill-up
// (global-setup), so the real scanner reads the real QR and the real
// /cards/scan lookup runs. The journey is the same at every width: scan →
// confirm the vehicle → fuel and amount → review the rules → done, and, when a
// rule is broken, the exception step.
//
// POST /auth/login is throttled to 5/min per app instance, so this file keeps
// to ONE test (one login) and switches the viewport mid-test.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${FAKE_CAMERA_HISTORY_PATH}`,
    ],
  },
});

test('supervisor: scan the card, confirm the vehicle, trip the gap rule and resolve it as an exception', async ({ page }) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  // Petrol-station roles never register vehicles: no registration entry point.
  await expect(page.getByRole('link', { name: 'تسجيل المركبات' })).toHaveCount(0);

  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).click();
  await expect(page).toHaveURL('/fillups/new');

  // Phone width: the scan step opens straight into the camera, with no
  // type-the-plate way around it.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('fillup-mobile-wizard')).toBeVisible();
  await expect(page.getByTestId('fillup-type-plate-instead')).toHaveCount(0);
  await expect(page.getByTestId('fillup-not-registered')).toHaveCount(0);

  // The card is read → «هل هذه هي المركبة التي أمامك؟» with the plate first.
  const confirm = page.getByTestId('fillup-scan-confirm');
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  const [city, seq] = fixtures.vehicleCurrentPlate.split('-');
  await expect(page.getByTestId('fillup-scan-confirm-plate')).toHaveText(`${city} - ${seq}`);
  await page.getByTestId('fillup-scan-confirm-yes').click();

  // Fuel and amount, at a real desktop width: the same wizard.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('fillup-mobile-wizard')).toBeVisible();
  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await expect(page.getByTestId('fillup-estimated-liters-mobile')).toBeVisible();
  await page.getByTestId('fillup-mobile-continue-to-review').click();

  // Review: the real rule preview. The fixture fill-up a few seconds ago is
  // well inside the minimum gap.
  await expect(page.getByTestId('rule-review-card-mobile')).toBeVisible();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مرفوض');
  await page.getByTestId('fillup-submit-mobile').click();
  await expect(page.getByTestId('rule-review-card-mobile')).toContainText('تعذر تسجيل التعبئة');
  await page.getByTestId('fillup-mobile-record-exception').click();

  // Exception step: the type list is dynamic; pick the first and fill the
  // proof field only when it is asked for.
  await expect(page.getByTestId('fillup-rejection-mobile')).toBeVisible();
  await page.getByTestId('exception-type-select-mobile').selectOption({ index: 1 });
  await page.getByTestId('exception-reason-mobile').fill('اختبار Playwright — تدفق الاستثناء الكامل');
  const proofField = page.getByTestId('exception-proof-mobile');
  if (await proofField.isVisible().catch(() => false)) {
    await proofField.fill('PW-PROOF-001');
  }
  await page.getByTestId('exception-submit-mobile').click();

  await expect(page.getByTestId('fillup-success')).toBeVisible();
  await expect(page.getByTestId('fillup-success')).toContainText('استثناء');
  // Phase 6: no approval step - it is recorded at once.
  await expect(page.getByTestId('fillup-success')).not.toContainText('بانتظار');

  // It shows at once in the exceptions page this supervisor can already see.
  await page.getByRole('link', { name: 'الاستثناءات' }).first().click();
  await expect(page).toHaveURL('/reports/violations');
  const row = page.getByTestId('exceptions-row').first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(fixtures.stationName);
});
