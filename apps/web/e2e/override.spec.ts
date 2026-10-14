import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Phase 6: with no camera the pump cannot scan. The fallback is a search of a
// REGISTERED vehicle (plate, owner name or booklet), a reason, and it is
// recorded «بدون بطاقة». An unregistered vehicle is never found. (No fake
// camera here: getUserMedia fails, which is exactly "the camera does not work".)
test('supervisor: no camera, so a registered vehicle is found by search and recorded «بدون بطاقة»', async ({ page }) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).first().click();
  await expect(page).toHaveURL('/fillups/new');

  // The camera cannot open: a retry, and no typed-plate way around the card.
  await expect(page.getByTestId('qr-scan-retry-camera')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('fillup-type-plate-instead')).toHaveCount(0);

  await page.getByTestId('fillup-nocard-open').click();
  await expect(page.getByTestId('fillup-nocard-form')).toContainText('لمركبة مسجّلة فقط');

  // An unregistered plate finds nothing.
  await page.getByTestId('fillup-nocard-search').fill(`3-${Date.now().toString().slice(-7)}`);
  await expect(page.getByTestId('fillup-nocard-none')).toContainText('غير مسجّلة');

  // A registered vehicle, found by its owner's name this time.
  await page.getByTestId('fillup-nocard-search').fill(fixtures.cleanVehicleOwnerFullName);
  await page.getByTestId('fillup-nocard-result').first().click();
  await expect(page.getByTestId('fillup-nocard-confirm')).toBeDisabled();
  await page.getByTestId('fillup-nocard-reason-CARD_DAMAGED').check();
  await page.getByTestId('fillup-nocard-confirm').click();

  await expect(page.getByTestId('fillup-nocard-active')).toContainText('البطاقة تالفة');
  await page.getByTestId('fillup-mobile-continue-to-fuel').click();
  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await page.getByTestId('fillup-mobile-continue-to-review').click();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مقبول');
  await page.getByTestId('fillup-submit-mobile').click();

  await expect(page.getByTestId('fillup-success-heading')).toBeVisible();
  await expect(page.getByTestId('fillup-success-nocard')).toContainText('بدون بطاقة');
});
