import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// The core loop this phase closes: record a fill-up -> the rule engine
// trips (global-setup already recorded one fill-up for this exact
// vehicle/driver pair, so an immediate second one is guaranteed to hit the
// gap rule) -> submit it as an exception with a mandatory reason -> a
// supervisor approves it from the violations list. All through the
// browser, as one session (POST /auth/login is throttled to 5/min).
test('supervisor records a fill-up, it trips a rule, submits as an exception, then approves it', async ({
  page,
}) => {
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  // Client-side nav (click the link), not page.goto() — goto() is a real
  // browser navigation, which remounts the app and re-triggers
  // AuthProvider's silent /auth/refresh (throttled 10/min). AuthProvider
  // has no retry-on-429 for that call (a real, separate gap — see the
  // summary), so stacking up avoidable full reloads across this suite's
  // tests risks tipping a LATER, unrelated test into a throttled refresh
  // that bounces it back to /login. Prefer in-app navigation wherever a
  // link exists.
  await page.getByRole('link', { name: 'تسجيل تعبئة' }).click();
  await expect(page).toHaveURL('/fillups/new');

  await page.getByTestId('vehicle-search-input').fill(fixtures.vehicleCurrentPlate);
  await page.getByTestId('vehicle-search-option').first().click();

  await page.getByTestId('driver-search-input').fill(fixtures.driverFullName);
  await page.getByTestId('driver-search-option').first().click();

  await page.locator('input[name="quantityLiters"]').fill('20');
  await page.getByTestId('fillup-submit').click();

  // Rejected: global-setup already recorded a fill-up for this exact
  // vehicle/driver a few seconds ago, well inside the minimum gap.
  await expect(page.getByTestId('fillup-rejection')).toBeVisible();
  await expect(page.getByTestId('fillup-rejection')).toContainText('تعذر تسجيل التعبئة');

  // Exception type list is dynamic (accumulated across e2e runs, no DELETE
  // endpoints) — pick whichever comes first and handle the proof field
  // conditionally, rather than assuming a specific category's proof
  // requirement.
  await page.getByTestId('exception-type-select').selectOption({ index: 1 });
  await page.getByTestId('exception-reason').fill('اختبار Playwright — تدفق الاستثناء الكامل');
  const proofField = page.getByTestId('exception-proof');
  if (await proofField.isVisible().catch(() => false)) {
    await proofField.fill('PW-PROOF-001');
  }
  await page.getByTestId('exception-submit').click();

  await expect(page.getByTestId('fillup-success')).toBeVisible();
  await expect(page.getByTestId('fillup-success')).toContainText('استثناء');

  // Close the loop: the violation now appears pending in the list this
  // same supervisor already has reports:view for, and approving it (their
  // own fillups:approve_exception) flips it to approved.
  await page.getByRole('link', { name: 'المخالفات' }).click();
  await expect(page).toHaveURL('/reports/violations');
  const row = page.locator('tbody tr', { hasText: fixtures.driverFullName });
  await expect(row).toContainText('قيد الانتظار');

  await row.getByTestId('approve-exception-button').click();
  await expect(row).toContainText('معتمدة');
  await expect(row.getByTestId('approve-exception-button')).toHaveCount(0);
});
