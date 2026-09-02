import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Round 8: the mobile guided wizard (design/feedback-2026-08-31/01-*.png,
// 02-*.png) and the existing desktop single-page form share this ONE
// test/login — POST /auth/login is throttled to 5/min per app instance,
// and this suite already runs at exactly that budget (see the other spec
// files' own comments); a second `test()` here would mean a second login
// and tip the whole suite over, which is exactly what happened the first
// time this file grew an extra login (round 7's digit-box coverage was
// folded in here for the same reason, and is now folded further into the
// mobile-wizard segment below rather than duplicated). Viewport is
// switched mid-test (same session, no extra navigation/login) to exercise
// both layouts.
test('supervisor completes the mobile guided wizard for a new vehicle, then trips a rule on the desktop form and resolves it as an exception', async ({
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
  // exact: true — HomePage's own permission-gated quick-link card carries
  // the same heading plus a hint line as its accessible name ("تسجيل
  // تعبئة تسجيل عملية تعبئة جديدة لمركبة"), which otherwise makes this
  // locator ambiguous alongside the sidebar's nav link.
  await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).click();
  await expect(page).toHaveURL('/fillups/new');

  // ── Mobile guided wizard (round 8) ────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('fillup-mobile-wizard')).toBeVisible();

  // Step 1 — plate: boxed digit entry (round 7's DigitBoxInput, now
  // reached through the actual guided step the client complained was
  // missing). Only the RIGHT digit of the 2-box city-code group is
  // mandatory — type a single digit, then jump straight to the sequence
  // group's first box, same "only the rightmost mandatory" rule as before.
  const runSeq = Date.now().toString().slice(-7);
  await page.getByTestId('fillup-mobile-plate-input-box-0').fill('9');
  await page.getByTestId('fillup-mobile-plate-input-box-2').click();
  for (const digit of runSeq) {
    await page.keyboard.type(digit);
  }
  await expect(page.getByTestId('fillup-mobile-plate-input-box-1')).toHaveValue(''); // untouched optional box

  // No vehicle registered under this fresh plate — the wizard offers to
  // create one inline rather than dead-ending.
  await expect(page.getByTestId('fillup-mobile-no-match')).toBeVisible();
  await page.getByTestId('fillup-mobile-add-vehicle').click();

  // The plate typed above carries over as-is (VehicleCreateForm's
  // initialPlate) — only owner data needs filling here. Exercises the
  // OTHER digit-box shape (12 mandatory boxes) plus a backspace-across-
  // boxes check, same as round 7's coverage, just reached via the wizard
  // now instead of a standalone detour.
  await page.getByTestId('new-vehicle-add-owner-toggle').click();
  await page.getByTestId('new-owner-fullname-input').fill(`PW Wizard Owner ${runSeq}`);
  const ownerDigits = `1${runSeq}0000`; // 12 digits, valid NATIONAL_ID prefix
  await page.getByTestId('new-owner-identity-input-box-0').click();
  for (const digit of ownerDigits) {
    await page.keyboard.type(digit);
  }
  // Backspace on a filled box clears it in place; a second Backspace, now
  // that the box is empty, moves to the previous box and clears that too.
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('new-owner-identity-input-box-11')).toHaveValue('');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('new-owner-identity-input-box-10')).toHaveValue('');
  await page.keyboard.type(ownerDigits.slice(10));
  await page.getByTestId('new-vehicle-save').click();

  // Step 2 — vehicle-match confirmation: the wizard auto-advances once the
  // vehicle exists, showing the same inline preview (make/model/usage-
  // type/owner) the desktop form uses.
  // -mobile suffix: the desktop layout's own VehiclePreviewCard is CSS-
  // hidden but still mounted at this viewport (shared react-hook-form
  // state across both layouts), so a bare testid would match two elements.
  await expect(page.getByTestId('vehicle-preview-card-mobile')).toContainText(`PW Wizard Owner ${runSeq}`);
  await page.getByTestId('fillup-mobile-continue-to-fuel').click();

  // Step 3 — fuel + quantity.
  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await expect(page.getByTestId('fillup-estimated-liters-mobile')).toBeVisible();
  await page.getByTestId('fillup-mobile-continue-to-review').click();

  // Step 4 — rule review: a brand-new vehicle/owner with no history at all
  // passes every check, computed by the real GET /fillups/rule-preview
  // endpoint (not a client-side estimate).
  await expect(page.getByTestId('rule-review-card-mobile')).toBeVisible();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مقبول');
  await page.getByTestId('fillup-submit-mobile').click();

  // Step 5 — confirmation (shared with the desktop layout, renders the
  // same at both widths).
  await expect(page.getByTestId('fillup-success-heading')).toContainText('تم تسجيل التعبئة');
  await page.getByRole('button', { name: 'تعبئة جديدة' }).click();

  // ── Back to desktop: the violation + exception path ────────────────
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByTestId('vehicle-search-input').fill(fixtures.vehicleCurrentPlate);
  await page.getByTestId('vehicle-search-option').first().click();

  // The pre-submit rule-review breakdown appears once a vehicle is picked,
  // with real numbers computed by the same rule engine POST /fillups
  // itself runs — not a separate client-side estimate.
  await expect(page.getByTestId('rule-review-card')).toBeVisible();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT')).toBeVisible();

  // The form takes the amount paid (LYD), not the liter count directly —
  // quantityLiters is computed from it (amount ÷ price-per-liter) and
  // submitted as-is; this test doesn't care about the specific liter
  // value, only that a valid one gets computed and submitted.
  await page.getByTestId('fillup-amount-input').fill('10');
  await expect(page.getByTestId('fillup-estimated-liters')).toBeVisible();
  await page.getByTestId('fillup-submit').click();

  // Rejected: global-setup already recorded a fill-up for this exact
  // vehicle a few seconds ago, well inside the minimum gap. The
  // rule-review card's summary badge flips to the failure state, and the
  // specific violated rule's row is marked rejected — not hidden, the
  // other (still-passing) rows stay visible alongside it.
  await expect(page.getByTestId('fillup-rejection')).toBeVisible();
  await expect(page.getByTestId('rule-review-card')).toContainText('تعذر تسجيل التعبئة');
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT')).toContainText('مرفوض');

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
  const row = page.locator('tbody tr', { hasText: fixtures.ownerFullName });
  await expect(row).toContainText('قيد الانتظار');

  await row.getByTestId('approve-exception-button-desktop').click();
  await expect(row).toContainText('معتمدة');
  await expect(row.getByTestId('approve-exception-button-desktop')).toHaveCount(0);
});
