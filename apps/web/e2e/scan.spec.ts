/// <reference lib="dom" />
import { test, expect, type Page } from '@playwright/test';
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

// Every stream the page asks the camera for, so a test can check afterwards
// that none is left running (the iOS camera indicator stays on if one is).
async function trackCameraStreams(page: Page) {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    (window as unknown as { __streams: MediaStream[] }).__streams = streams;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await real(constraints);
      streams.push(stream);
      return stream;
    };
  });
}

const liveTracks = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __streams: MediaStream[] }).__streams
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live').length,
  );

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

test('pump: after a successful scan the camera is released and later frames cannot move the wizard back', async ({
  page,
}) => {
  await trackCameraStreams(page);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).first().click();
  await expect(page.getByTestId('fillup-scan-confirm')).toBeVisible({ timeout: 30_000 });

  // No camera track is left running once the card was read.
  await expect.poll(() => liveTracks(page)).toBe(0);

  // «نعم، هذه هي المركبة» moves on and stays there: a scanner that kept
  // decoding would re-resolve the card and send the wizard back to this step.
  await page.getByTestId('fillup-scan-confirm-yes').click();
  await expect(page.getByTestId('fillup-amount-input-mobile')).toBeVisible();
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('fillup-amount-input-mobile')).toBeVisible();
  await expect(page.getByTestId('fillup-scan-confirm')).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);
});
