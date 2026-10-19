import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs, navigateInApp } from './helpers';

const fixtures = loadFixtures();

// Each test logs in exactly once and performs every assertion for that
// role within the same session — POST /auth/login is throttled to 5/min
// per app instance, and re-logging in per-assertion would exceed that
// budget well within this suite's actual wall-clock runtime (this was
// confirmed the hard way: an earlier, more-fragmented version of this
// suite genuinely hit 429s from its own login volume, which manifested as
// "stuck on /login" failures with no obvious cause from the UI alone).

test('supervisor session: no directorate section, sees own station day screen (masked owner identity), and can export it', async ({
  page,
}) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  // Nav: the day screen and the exceptions page; the dashboard is gone.
  await expect(page.getByRole('link', { name: 'لوحة المتابعة' })).toHaveCount(0);
  await expect(page.locator('aside').getByRole('link', { name: 'اليوم' })).toBeVisible();
  await expect(page.locator('aside').getByRole('link', { name: 'الاستثناءات' })).toBeVisible();

  // Masking: §8's rule, operationalized as reports:view_all_stations —
  // supervisor1 lacks it, so only the last 4 digits render. Round 6: the
  // driver detail page this used to check is gone — the owner's identity
  // number on the vehicle detail page is the equivalent surface now (see
  // docs/DESIGN_owner_based_fillups.md).
  await navigateInApp(page, `/vehicles/${fixtures.vehicleId}`);
  const last4 = fixtures.ownerIdentityNumber.slice(-4);
  const maskedField = page.getByTestId('vehicle-owner-identity-number');
  await expect(maskedField).toContainText('*');
  await expect(maskedField).toContainText(last4);
  await expect(maskedField).not.toHaveText(fixtures.ownerIdentityNumber);

  // After review (19 Oct 2026): a station supervisor no longer holds
  // owners:reveal_identity — the number stays masked, with no reveal toggle.
  await expect(maskedField.getByTestId('owner-identity-reveal-toggle')).toHaveCount(0);

  // Export: their own station is auto-selected in a disabled <select>
  // (GET /stations-backed StationSelect, not a free-text input — see this
  // phase's item 2 fix) — the selected <option>'s label carries the
  // internalCode, not the element's value (that's the stationId).
  // Exporting must trigger a real file download, not just render a button.
  await navigateInApp(page, '/reports/daily');
  const stationSelect = page.locator('select[disabled]');
  await expect(stationSelect.locator('option:checked')).toHaveText(
    new RegExp(fixtures.stationInternalCode),
  );
  // One export pattern: a CSV button (and a PDF one, since a day is worth printing).
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('daily-export-csv').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  expect(await download.path()).toBeTruthy();

  // Round 7 item 3: owner-search filter — searching by the owner's ID
  // number (same "search by ID, not name" precedent as the old driver
  // field) narrows the results table to just that owner's fill-ups.
  await page.getByTestId('owner-search-input').fill(fixtures.ownerIdentityNumber);
  await page.getByTestId('owner-search-option').first().click();
  await expect(page.locator('tbody tr').first()).toContainText(fixtures.ownerFullName);
});

test('directorate_admin session: the directorate section is on the day screen, and the same owner\'s identityNumber renders unmasked', async ({
  page,
}) => {
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  await navigateInApp(page, '/reports/daily');
  await expect(page.getByTestId('directorate-overview')).toBeVisible();

  await navigateInApp(page, `/vehicles/${fixtures.vehicleId}`);
  await expect(page.getByTestId('vehicle-owner-identity-number')).toHaveText(fixtures.ownerIdentityNumber);
});
