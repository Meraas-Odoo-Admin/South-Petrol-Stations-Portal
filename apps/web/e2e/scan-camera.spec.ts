/// <reference lib="dom" />
import { test, expect, type Page } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// The scan step on a real phone: layout and flashlight. Chromium's fake
// camera is landscape 640x480, which never exposed the bug seen on an iPhone
// (a tall portrait stream pushed the bottom bar out of view), so these tests
// replace getUserMedia with a synthetic stream whose size and capabilities
// they control.
type CameraStub = {
  width: number;
  height: number;
  // What track.getCapabilities() additionally reports (merged over the real one).
  capabilities: Record<string, unknown>;
};

async function stubCamera(page: Page, stub: CameraStub) {
  await page.addInitScript((s: CameraStub) => {
    const streams: MediaStream[] = [];
    (window as unknown as { __streams: MediaStream[] }).__streams = streams;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = s.width;
      canvas.height = s.height;
      const ctx = canvas.getContext('2d')!;
      const paint = () => {
        ctx.fillStyle = '#cfd8d6';
        ctx.fillRect(0, 0, s.width, s.height);
        ctx.fillStyle = '#16302c';
        ctx.fillRect(40 + (Date.now() % 200), 200, 80, 80);
      };
      paint();
      setInterval(paint, 100);
      const stream = canvas.captureStream(10);
      const track = stream.getVideoTracks()[0]!;
      const real = track.getCapabilities.bind(track);
      track.getCapabilities = () => ({ ...real(), ...s.capabilities }) as MediaTrackCapabilities;
      streams.push(stream);
      return stream;
    };
  }, stub);
}

async function openScanStep(page: Page) {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).first().click();
  await expect(page).toHaveURL('/fillups/new');
  await expect(page.getByTestId('qr-scan-panel')).toBeVisible();
}

const PHONES = [
  { name: 'iPhone SE', width: 320, height: 568 },
  { name: 'iPhone 14', width: 390, height: 844 },
  { name: 'large phone', width: 430, height: 932 },
];

test('scan step: the panel stays inside the screen once a tall camera stream is playing, on any phone size, with no type-the-plate link', async ({
  page,
}) => {
  await stubCamera(page, { width: 720, height: 1280, capabilities: {} });
  await page.setViewportSize({ width: PHONES[1]!.width, height: PHONES[1]!.height });
  await openScanStep(page);

  for (const phone of PHONES) {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    const override = page.getByTestId('fillup-override-open');
    const video = page.getByTestId('qr-scan-panel').locator('video');
    // The stream is really playing (frames arrived), not just requested.
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { message: phone.name })
      .toBeGreaterThan(0);
    await expect(page.getByTestId('fillup-type-plate-instead'), phone.name).toHaveCount(0);
    // The supervisor's override entry sits under the panel and stays reachable.
    await expect(override, phone.name).toBeVisible();
    // And the panel itself did not grow past the screen because of the video.
    const panel = await page.getByTestId('qr-scan-panel').boundingBox();
    expect(panel!.height, phone.name).toBeLessThanOrEqual(Math.max(phone.height * 0.62, 360) + 1);
  }
});

test('scan step: the flashlight button shows only when the camera track really reports torch', async ({ page }) => {
  // A camera that lists a `torch` key but says it cannot do it.
  await stubCamera(page, { width: 640, height: 480, capabilities: { torch: false } });
  await page.setViewportSize({ width: 390, height: 844 });
  await openScanStep(page);
  await expect
    .poll(() => page.getByTestId('qr-scan-panel').locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth))
    .toBeGreaterThan(0);
  await expect(page.getByTestId('qr-scan-torch')).toHaveCount(0);
});

test('scan step: the flashlight button shows when the camera track reports torch support', async ({ page }) => {
  await stubCamera(page, { width: 640, height: 480, capabilities: { torch: true } });
  await page.setViewportSize({ width: 390, height: 844 });
  await openScanStep(page);
  await expect(page.getByTestId('qr-scan-torch')).toBeVisible();
});

test('scan step: the flashlight button shows when the track lists torch as a list of values including true', async ({
  page,
}) => {
  await stubCamera(page, { width: 640, height: 480, capabilities: { torch: [false, true] } });
  await page.setViewportSize({ width: 390, height: 844 });
  await openScanStep(page);
  await expect(page.getByTestId('qr-scan-torch')).toBeVisible();
});
