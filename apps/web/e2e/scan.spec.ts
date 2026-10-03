import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';
import { FAKE_CAMERA_PATH } from './global-setup';

const fixtures = loadFixtures();

// Registration pivot, phase 3 — scanning a real printed card at the pump,
// end to end. Chromium's fake camera streams the card's own rendered front
// (built from GET /cards/:id/preview in global-setup), so the real scanner
// (zxing) reads the real QR and the real /cards/scan lookup runs.
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

test('pump: the plate step opens straight into the camera, reads the card, and asks to confirm the vehicle before anything is recorded', async ({
  page,
}) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).first().click();
  await expect(page).toHaveURL('/fillups/new');

  // Scan-first: no tap needed to open the camera.
  await expect(page.getByTestId('qr-scan-panel')).toBeVisible();

  // The card is read → the big confirmation view, plate first.
  const confirm = page.getByTestId('fillup-scan-confirm');
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  const [city, seq] = fixtures.scanVehicleCurrentPlate.split('-');
  await expect(page.getByTestId('fillup-scan-confirm-plate')).toHaveText(`${city} - ${seq}`);
  await expect(confirm).toContainText('تويوتا هايلكس — أبيض');
  await expect(page.getByTestId('fillup-scan-needs-reissue')).toHaveCount(0);

  // Nothing is recorded without the tap.
  await page.getByTestId('fillup-scan-confirm-yes').click();
  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await page.getByTestId('fillup-mobile-continue-to-review').click();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مقبول');
  await page.getByTestId('fillup-submit-mobile').click();
  await expect(page.getByTestId('fillup-success-heading')).toContainText('تم تسجيل التعبئة');
});
