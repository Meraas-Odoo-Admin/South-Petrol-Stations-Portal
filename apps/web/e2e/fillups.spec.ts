import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Round 10: the guided wizard is now the ONLY fill-up experience at every
// width — there's no separate desktop single-page form left to test
// (removed outright, per the client's explicit confirmation they want the
// same step-by-step journey on laptop/desktop too, not a wider form). This
// test still exercises both a narrow and a wide viewport, but both now walk
// the SAME wizard/testids (the `-mobile` suffix is a round-8 leftover from
// when a desktop form shared the DOM and needed disambiguating; it's kept
// as-is here since the wizard component itself hasn't been renamed).
// POST /auth/login is throttled to 5/min per app instance, and this suite
// already runs at exactly that budget (see the other spec files' own
// comments); a second `test()` here would mean a second login and tip the
// whole suite over, which is exactly what happened the first time this file
// grew an extra login (round 7's digit-box coverage was folded in here for
// the same reason, and is now folded further into the mobile-wizard segment
// below rather than duplicated). Viewport is switched mid-test (same
// session, no extra navigation/login) to prove the wizard genuinely renders
// — and works — at a real desktop/laptop width, not just narrow ones.
test('supervisor completes the guided wizard for a new vehicle at mobile width, then trips a rule at desktop width and resolves it as an exception', async ({
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
  // mandatory. Round 10 fixed a bug where a single digit landed in the
  // FAR-LEFT box of that group (box-0), leaving the box touching the dash
  // (box-1) empty — backwards from the spec ("only the rightmost
  // mandatory, left one optional"). Round 11 refined WHEN that
  // right-alignment kicks in: round 10's version repositioned on every
  // keystroke, which broke typing a genuine two-digit prefix (the 2nd
  // digit had nowhere left to land, since focus had already jumped past
  // the group). Now a single digit stays put in box-0 (left-aligned)
  // WHILE the group is still active — it only migrates to box-1 (the
  // dash-adjacent box) once focus actually leaves the group, e.g. moving
  // on to type the sequence number.
  const runSeq = Date.now().toString().slice(-7);
  await page.getByTestId('fillup-mobile-plate-input-box-0').fill('9');
  await expect(page.getByTestId('fillup-mobile-plate-input-box-0')).toHaveValue('9'); // still active — left-aligned
  await expect(page.getByTestId('fillup-mobile-plate-input-box-1')).toHaveValue('');
  await page.getByTestId('fillup-mobile-plate-input-box-2').click(); // focus leaves the group — finalizes
  await expect(page.getByTestId('fillup-mobile-plate-input-box-1')).toHaveValue('9'); // now right-aligned to the dash
  await expect(page.getByTestId('fillup-mobile-plate-input-box-0')).toHaveValue(''); // left (optional) box empty
  for (const digit of runSeq) {
    await page.keyboard.type(digit);
  }

  // No vehicle registered under this fresh plate — the wizard offers to
  // create one inline rather than dead-ending.
  await expect(page.getByTestId('fillup-mobile-no-match')).toBeVisible();
  await page.getByTestId('fillup-mobile-add-vehicle').click();

  // The plate typed above carries over as-is (VehicleCreateForm's
  // initialPlate) — only owner data needs filling here. Round 11 item 1:
  // owner data is now mandatory and always shown (no more "add owner"
  // toggle to click through first). Exercises the OTHER digit-box shape
  // (12 mandatory boxes) plus a backspace-across-boxes check, same as
  // round 7's coverage, just reached via the wizard now instead of a
  // standalone detour.
  await page.getByTestId('new-owner-fullname-input').fill(`PW Wizard Owner ${runSeq}`);
  // Round 20: owner phone is now required (the WhatsApp-share button opens
  // a chat with it directly) — without this the form silently fails
  // validation on save and the wizard never advances past this step.
  await page.getByTestId('new-owner-phone-input').fill('0912345678');
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

  // ── Same wizard, now at a real desktop/laptop width: the violation +
  // exception path ─────────────────────────────────────────────────────
  // Round 10: the client confirmed they want the identical step-by-step
  // journey at every screen size — this is the specific thing that was
  // missing before (a separate, wider single-page form). Proving the
  // wizard itself (not just its container) renders and works at this
  // width is the point of switching viewport mid-test rather than
  // starting a fresh mobile-only test.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId('fillup-mobile-wizard')).toBeVisible();

  // Plate step: fall back to the manual search-by-plate/chassis path
  // (same one the mobile wizard offers) rather than the digit-box plate
  // entry, since this needs to find an EXISTING fixture vehicle by its
  // already-known current plate, not type a fresh one digit-by-digit.
  await page.getByTestId('fillup-mobile-manual-search-toggle').click();
  await page.getByTestId('vehicle-search-input').fill(fixtures.vehicleCurrentPlate);
  await page.getByTestId('vehicle-search-option').first().click();

  // Match step: same vehicle-preview card the mobile flow above used.
  await expect(page.getByTestId('vehicle-preview-card-mobile')).toBeVisible();
  await page.getByTestId('fillup-mobile-continue-to-fuel').click();

  // Fuel step. The form takes the amount paid (LYD), not the liter count
  // directly — quantityLiters is computed from it (amount ÷
  // price-per-liter) and submitted as-is; this test doesn't care about
  // the specific liter value, only that a valid one gets computed.
  await page.getByTestId('fillup-amount-input-mobile').fill('10');
  await expect(page.getByTestId('fillup-estimated-liters-mobile')).toBeVisible();
  await page.getByTestId('fillup-mobile-continue-to-review').click();

  // Review step: real numbers computed by the same rule engine POST
  // /fillups itself runs — not a client-side estimate. The PREVIEW
  // (GET /fillups/rule-preview) already shows the vehicle/owner gap
  // checks failing — global-setup recorded a fill-up for this exact
  // vehicle a few seconds ago, well inside the minimum gap — but the
  // "تعذر تسجيل التعبئة" rejected-pill state and the "record as
  // exception" action only appear after an actual submit attempt comes
  // back rejected (a real 422 from POST /fillups, not the preview), so
  // submit first.
  await expect(page.getByTestId('rule-review-card-mobile')).toBeVisible();
  await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مرفوض');
  await page.getByTestId('fillup-submit-mobile').click();
  await expect(page.getByTestId('rule-review-card-mobile')).toContainText('تعذر تسجيل التعبئة');
  await page.getByTestId('fillup-mobile-record-exception').click();

  // Exception step. Exception type list is dynamic (accumulated across
  // e2e runs, no DELETE endpoints) — pick whichever comes first and
  // handle the proof field conditionally, rather than assuming a
  // specific category's proof requirement.
  await expect(page.getByTestId('fillup-rejection-mobile')).toBeVisible();
  await page.getByTestId('exception-type-select-mobile').selectOption({ index: 1 });
  await page.getByTestId('exception-reason-mobile').fill('اختبار Playwright — تدفق الاستثناء الكامل');
  const proofField = page.getByTestId('exception-proof-mobile');
  if (await proofField.isVisible().catch(() => false)) {
    await proofField.fill('PW-PROOF-001');
  }
  await page.getByTestId('exception-submit-mobile').click();

  await expect(page.getByTestId('fillup-success')).toBeVisible();
  await expect(page.getByTestId('fillup-success')).toContainText('استثناء');
  // Round 12: fillups:record_exception (seeded to station_supervisor)
  // auto-approves at creation — "I don't want them to be approved by the
  // supervisor or admin" (client's own framing) — so the success screen
  // now says "معتمدة" immediately, not the old "بانتظار اعتماد المشرف".
  await expect(page.getByTestId('fillup-success')).toContainText('معتمدة');

  // Close the loop: the violation already appears APPROVED in the list
  // this same supervisor already has reports:view for — there's no
  // pending state to click through anymore, since the same permission
  // that let them record it as an exception also auto-approved it.
  await page.getByRole('link', { name: 'المخالفات' }).click();
  await expect(page).toHaveURL('/reports/violations');
  const row = page.locator('tbody tr', { hasText: fixtures.ownerFullName });
  await expect(row).toContainText('معتمدة');
  await expect(row.getByTestId('approve-exception-button-desktop')).toHaveCount(0);
});
