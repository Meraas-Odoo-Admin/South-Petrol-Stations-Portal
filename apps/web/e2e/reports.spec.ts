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
  // Scoped to the sidebar specifically — HomePage's own quick-link card
  // ("المخالفات الحالات التي تحتاج قرارك") shares the same substring, and
  // the sidebar's full label ("المخالفات والاستثناءات") isn't an exact
  // match either, so neither a bare substring nor exact:true disambiguates
  // on its own here.
  await expect(page.locator('aside').getByRole('link', { name: 'المخالفات' })).toBeVisible();

  // Masking: §8's rule, operationalized as reports:view_all_stations —
  // supervisor1 lacks it, so only the last 4 digits render.
  await page.goto(`/drivers/${fixtures.driverId}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(fixtures.driverFullName);
  const last4 = fixtures.driverIdentityNumber.slice(-4);
  const maskedField = page.getByTestId('driver-identity-number');
  await expect(maskedField).toContainText('*');
  await expect(maskedField).toContainText(last4);
  await expect(maskedField).not.toHaveText(fixtures.driverIdentityNumber);

  // Export: their own station is auto-selected in a disabled <select>
  // (GET /stations-backed StationSelect, not a free-text input — see this
  // phase's item 2 fix) — the selected <option>'s label carries the
  // internalCode, not the element's value (that's the stationId).
  // Exporting must trigger a real file download, not just render a button.
  await page.goto('/reports/daily');
  const stationSelect = page.locator('select[disabled]');
  await expect(stationSelect.locator('option:checked')).toHaveText(
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

  // exact: true — HomePage's own quick-link card carries the same heading
  // plus a hint line as its accessible name ("لوحة المتابعة نظرة عامة على
  // المحطات"), otherwise ambiguous alongside the sidebar's exact-text link.
  await expect(page.getByRole('link', { name: 'لوحة المتابعة', exact: true })).toBeVisible();

  await page.goto(`/drivers/${fixtures.driverId}`);
  await expect(page.getByTestId('driver-identity-number')).toHaveText(fixtures.driverIdentityNumber);
});
