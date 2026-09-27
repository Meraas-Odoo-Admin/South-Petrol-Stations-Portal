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

test('supervisor session: no dashboard link, sees own station daily report (masked owner identity), and can export it', async ({
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

  // Round 7 item 2: the reveal-toggle ported from the old drivers-list
  // pattern to POST /owners/:id/reveal-identity — supervisor1 holds
  // owners:reveal_identity (seed.ts), so clicking through shows the real
  // value even though the passive display above stays masked.
  await maskedField.getByTestId('owner-identity-reveal-toggle').click();
  await expect(maskedField).toHaveText(fixtures.ownerIdentityNumber);

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
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'تصدير Excel' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  expect(await download.path()).toBeTruthy();

  // Round 7 item 3: owner-search filter — searching by the owner's ID
  // number (same "search by ID, not name" precedent as the old driver
  // field) narrows the results table to just that owner's fill-ups.
  await page.getByTestId('owner-search-input').fill(fixtures.ownerIdentityNumber);
  await page.getByTestId('owner-search-option').first().click();
  await expect(page.locator('tbody tr').first()).toContainText(fixtures.ownerFullName);
});

test('directorate_admin session: dashboard link visible, and the same owner\'s identityNumber renders unmasked', async ({
  page,
}) => {
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  // exact: true — HomePage's own quick-link card carries the same heading
  // plus a hint line as its accessible name ("لوحة المتابعة نظرة عامة على
  // المحطات"), otherwise ambiguous alongside the sidebar's exact-text link.
  await expect(page.getByRole('link', { name: 'لوحة المتابعة', exact: true })).toBeVisible();

  await navigateInApp(page, `/vehicles/${fixtures.vehicleId}`);
  await expect(page.getByTestId('vehicle-owner-identity-number')).toHaveText(fixtures.ownerIdentityNumber);
});
