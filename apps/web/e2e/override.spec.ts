import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Phase 6: with no camera the pump cannot scan. The supervisor's emergency
// override is the one other way in: a REGISTERED vehicle's plate and a written
// reason, recorded as an exception under the supervisor's name. A plate that is
// not registered is refused. (No fake camera here: getUserMedia fails, which
// is exactly the "camera unavailable" state.)
test('supervisor: no camera, so the emergency override records a registered vehicle and refuses an unregistered plate', async ({
  page,
}) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).first().click();
  await expect(page).toHaveURL('/fillups/new');

  // The camera cannot open: a retry, and no typed-plate way around the card.
  await expect(page.getByTestId('qr-scan-retry-camera')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('fillup-type-plate-instead')).toHaveCount(0);

  // The override is offered to the supervisor, with its limits stated.
  await page.getByTestId('fillup-override-open').click();
  await expect(page.getByTestId('fillup-override-form')).toContainText('لمركبة مسجّلة فقط');

  // An unregistered plate is refused, and nothing is created for it.
  const unknownSeq = Date.now().toString().slice(-7);
  await page.getByTestId('fillup-override-plate').fill(`3-${unknownSeq}`);
  await page.getByTestId('fillup-override-reason').fill('اختبار — لوحة غير مسجّلة');
  await page.getByTestId('fillup-override-confirm').click();
  await expect(page.getByTestId('fillup-override-error')).toContainText('غير مسجّلة');
  await page.getByRole('button', { name: 'ليست هذه المركبة' }).click();

  // A registered vehicle: confirm it, fuel and amount, review, record. The
  // form stays open after going back.
  await page.getByTestId('fillup-override-plate').fill(fixtures.cleanVehicleCurrentPlate);
  await page.getByTestId('fillup-override-reason').fill('اختبار — تعذّر قراءة البطاقة');
  await page.getByTestId('fillup-override-confirm').click();
  await expect(page.getByTestId('fillup-override-active')).toBeVisible();
  await expect(page.getByTestId('fillup-override-confirm-vehicle')).toContainText(fixtures.cleanVehicleOwnerFullName);
  await page.getByTestId('fillup-mobile-continue-to-fuel').click();

  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await page.getByTestId('fillup-mobile-continue-to-review').click();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مقبول');
  await page.getByTestId('fillup-submit-mobile').click();

  await expect(page.getByTestId('fillup-success-heading')).toBeVisible();
  await expect(page.getByTestId('fillup-success-override')).toContainText('تفويض طارئ');
});
