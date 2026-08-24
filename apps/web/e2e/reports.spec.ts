import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Each test logs in exactly once and performs every assertion for that
// role within the same session — POST /auth/login is throttled to 5/min
// per app instance, and re-logging in per-assertion would exceed that
// budget well within this suite's actual wall-clock runtime (this was
// confirmed the hard way: an earlier, more-fragmented version of this
// suite genuinely hit 429s from its own login volume, which manifested as
// "stuck on /login" failures with no obvious cause from the UI alone).

test('supervisor session: no dashboard link, sees own station daily report (masked driver identity), and can export it', async ({
  page,
}) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  // Nav: station_supervisor holds reports:view but NOT
  // reports:view_all_stations — dashboard link must not render at all
  // (hide, don't disable — docs/IMPLEMENTATION_PLAN.md §9).
  await expect(page.getByRole('link', { name: 'لوحة المتابعة' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'التقرير اليومي' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'المخالفات' })).toBeVisible();

  // Masking: §8's rule, operationalized as reports:view_all_stations —
  // supervisor1 lacks it, so only the last 4 digits render.
  await page.goto(`/drivers/${fixtures.driverId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(fixtures.driverFullName);
  const last4 = fixtures.driverIdentityNumber.slice(-4);
  const maskedField = page.getByTestId('driver-identity-number');
  await expect(maskedField).toContainText('*');
  await expect(maskedField).toContainText(last4);
  await expect(maskedField).not.toHaveText(fixtures.driverIdentityNumber);

  // Export: their own station is auto-filled (scoped, read-only) —
  // shown as a disabled <input>'s VALUE, not text content, hence
  // toHaveValue() rather than getByText(). Exporting must trigger a real
  // file download, not just render a button.
  await page.goto('/reports/daily');
  await expect(page.locator('input[disabled]')).toHaveValue(
    new RegExp(fixtures.stationInternalCode),
  );
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'تصدير Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await download.path()).toBeTruthy();
});

test('directorate_admin session: dashboard link visible, and the same driver\'s identityNumber renders unmasked', async ({
  page,
}) => {
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  await expect(page.getByRole('link', { name: 'لوحة المتابعة' })).toBeVisible();

  await page.goto(`/drivers/${fixtures.driverId}`);
  await expect(page.getByTestId('driver-identity-number')).toHaveText(fixtures.driverIdentityNumber);
});
