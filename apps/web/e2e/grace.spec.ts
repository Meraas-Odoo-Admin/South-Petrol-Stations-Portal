import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Phase 4a browser pass — launch day for vehicles without a card, steps 1 to
// 7 of the close-out checklist, in one story (one login per role, because
// POST /auth/login is throttled; see the other specs). The municipality's
// dates are changed through the real admin screen and put back at the end
// (also in `finally`, so a failure never leaves سبها in a changed stage).
const SHOTS = path.resolve(process.cwd(), 'test-results', 'p4a');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

// Tripoli calendar day → dd/mm/yyyy, what the admin date field takes.
function tripoliDay(offsetDays: number): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tripoli', day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.day}/${parts.month}/${parts.year}`;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

// Types a plate into the two groups of boxes: the city code, then the number.
// `arabic` types Arabic-Indic digits, as on an Arabic keyboard.
async function typePlateDigits(page: Page, prefix: string, digits: string, arabic = false) {
  const box = (i: number) => page.getByTestId(`fillup-mobile-plate-input-box-${i}`);
  const press = async (d: string) =>
    arabic ? page.keyboard.insertText(ARABIC_DIGITS[Number(d)]!) : page.keyboard.type(d);
  await box(0).click();
  for (const d of prefix) await press(d);
  if (prefix.length === 1) await box(2).click();
  for (const d of digits) await press(d);
}

async function clearPlate(page: Page) {
  await page.getByTestId('fillup-mobile-plate-input-box-8').click();
  for (let i = 0; i < 20; i++) await page.keyboard.press('Backspace');
}

async function recordFromReview(page: Page, amount = '10') {
  await page.getByTestId('fillup-amount-input-mobile').fill(amount);
  await expect(page.getByTestId('fillup-estimated-liters-mobile')).toBeVisible();
  await page.getByTestId('fillup-mobile-continue-to-review').click();
}

async function setStageDates(adminPage: Page, awareness: string, deadline: string, confirmName?: string) {
  const row = adminPage.locator('tr', { hasText: 'سبها' }).first();
  await row.getByRole('button', { name: 'تواريخ المراحل' }).click();
  const editor = adminPage.getByTestId('municipality-dates-editor');
  const inputs = editor.getByTestId('date-field-input');
  await inputs.nth(0).fill(awareness);
  await inputs.nth(1).fill(deadline);
  if (confirmName) {
    await expect(adminPage.getByTestId('municipality-dates-confirm')).toBeVisible();
    await adminPage.getByTestId('municipality-dates-confirm-name').fill(confirmName);
  }
  await editor.getByRole('button', { name: 'حفظ' }).click();
  await expect(editor).toHaveCount(0);
}

test('launch day: unregistered fill-ups, linking, awareness, deadline, override, sheet', async ({ page, browser }) => {
  test.setTimeout(480_000);
  const registrarCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const registrar = await registrarCtx.newPage();
  const admin = await adminCtx.newPage();
  const seq = Date.now().toString().slice(-6);

  try {
    // The municipalities screen is the system administrator's.
    await loginAs(admin, 'sysadmin1', fixtures.sysadminPasswordChanged ? 'PwTemp123!' : process.env.PW_SYSADMIN_PASSWORD || 'ChangeMe123!');
    await admin.goto('/admin/municipalities');
    await expect(admin.locator('tr', { hasText: 'سبها' }).first()).toBeVisible();
    await shot(admin, '00-municipalities-initial');

    // ── Step 1: grace — an unregistered plate is recorded, a too-soon retry
    // typed differently (leading zero, Arabic digits) is blocked, and a
    // different city code (71-… for 7-1…) is another car and is not.
    await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'تسجيل تعبئة', exact: true }).click();
    await page.getByTestId('fillup-type-plate-instead').first().click();

    await typePlateDigits(page, '7', `1${seq}`.slice(0, 7));
    await expect(page.getByTestId('fillup-not-registered')).toBeVisible();
    await page.getByTestId('fillup-record-unregistered').click();
    await expect(page.getByTestId('fillup-unregistered-confirm')).toBeVisible();
    await shot(page, '01-unregistered-confirm');
    await page.getByTestId('fillup-unregistered-confirm-yes').click();
    await recordFromReview(page);
    await expect(page.getByTestId('fillup-skipped-rules')).toBeVisible();
    await page.getByTestId('fillup-submit-mobile').click();
    await expect(page.getByTestId('fillup-success-heading')).toContainText('تم تسجيل التعبئة');
    await expect(page.getByTestId('fillup-success-unregistered')).toBeVisible();
    await expect(page.getByTestId('fillup-awareness')).toHaveCount(0);
    await shot(page, '02-unregistered-success');
    await page.getByRole('button', { name: 'تعبئة جديدة' }).click();

    // The same car typed differently is still that car: a leading zero in
    // the city code ("07" for "7"), then Arabic-Indic digits.
    const firstPlateDigits = `1${seq}`.slice(0, 7);
    await page.getByTestId('fillup-type-plate-instead').first().click();
    await typePlateDigits(page, '07', firstPlateDigits);
    await expect(page.getByTestId('fillup-record-unregistered')).toBeVisible();
    await page.getByTestId('fillup-record-unregistered').click();
    await page.getByTestId('fillup-unregistered-confirm-yes').click();
    await recordFromReview(page);
    await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مرفوض');
    await shot(page, '03a-retry-leading-zero-blocked');

    await page.goto('/fillups/new');
    await page.getByTestId('fillup-type-plate-instead').first().click();
    await typePlateDigits(page, '7', firstPlateDigits, true);
    await expect(page.getByTestId('fillup-record-unregistered')).toBeVisible();
    await page.getByTestId('fillup-record-unregistered').click();
    await page.getByTestId('fillup-unregistered-confirm-yes').click();
    await recordFromReview(page);
    await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مرفوض');
    await shot(page, '03b-retry-arabic-digits-blocked');

    // 7-1234567 and 71-234567 are DIFFERENT cars (city code 7 vs 71): the
    // second is not held back by the first one's gap, and is recorded.
    await page.goto('/fillups/new');
    await page.getByTestId('fillup-type-plate-instead').first().click();
    await typePlateDigits(page, '71', firstPlateDigits.slice(1));
    await expect(page.getByTestId('fillup-record-unregistered')).toBeVisible();
    await page.getByTestId('fillup-record-unregistered').click();
    await page.getByTestId('fillup-unregistered-confirm-yes').click();
    await recordFromReview(page);
    await expect(page.getByTestId('rule-check-VEHICLE_GAP_TOO_SHORT-mobile')).toContainText('مقبول');
    await shot(page, '03c-other-city-code-is-another-car');
    await page.getByTestId('fillup-submit-mobile').click();
    await expect(page.getByTestId('fillup-success-heading')).toContainText('تم تسجيل التعبئة');

    // ── Step 2: register the vehicle — the earlier fill-up is found and linked.
    await loginAs(registrar, fixtures.registrarUsername, fixtures.registrarPassword);
    await registrar.locator('aside').getByRole('link', { name: 'تسجيل المركبات' }).click();
    const identity = `1${Math.floor(Math.random() * 1e11).toString().padStart(11, '0')}`;
    await registrar.getByTestId('registration-identity-input-box-0').click();
    await registrar.keyboard.type(identity);
    await registrar.getByTestId('registration-owner-search').click();
    await registrar.getByTestId('registration-owner-name').fill(`PW Grace Owner ${fixtures.runId}`);
    await registrar.getByTestId('registration-owner-phone').fill('0912345678');
    await registrar.getByTestId('registration-owner-save').click();
    await expect(registrar.getByTestId('registration-owner-selected')).toBeVisible();
    await registrar.getByTestId('registration-plate-input-box-0').fill('7');
    await registrar.getByTestId('registration-plate-input-box-2').click();
    for (const d of firstPlateDigits) await registrar.keyboard.type(d);
    await registrar.getByTestId('registration-vehicle-save').click();
    await expect(registrar.getByTestId('registration-success')).toContainText('تم تسجيل المركبة');
    // Only the 7-… fill-up joins the car; the 71-… one is another car.
    await expect(registrar.getByTestId('registration-linked-fillups')).toContainText('1 تعبئة سابقة');
    await shot(registrar, '04-registered-and-linked');

    // ── Step 3: awareness starts today, the deadline is ten days out.
    await setStageDates(admin, tripoliDay(0), tripoliDay(10));
    await expect(admin.getByTestId(/municipality-stage-/).first()).toBeVisible();
    await shot(admin, '05-municipalities-awareness');

    await page.goto('/fillups/new');
    await page.getByTestId('fillup-type-plate-instead').first().click();
    const awarenessSeq = `2${seq}`.slice(0, 7);
    await typePlateDigits(page, '7', awarenessSeq);
    await page.getByTestId('fillup-record-unregistered').click();
    await page.getByTestId('fillup-unregistered-confirm-yes').click();
    await recordFromReview(page);
    await page.getByTestId('fillup-submit-mobile').click();
    const awareness = page.getByTestId('fillup-awareness');
    await expect(awareness).toBeVisible();
    await expect(awareness).toContainText('لن تتم تعبئة أي مركبة بدون بطاقة');
    await expect(awareness).toContainText(fixtures.registrationStationName);
    await expect(page.getByTestId('fillup-awareness-flyer')).toContainText('سلّم السائق نشرة التوعية');
    await shot(page, '06-awareness-success');

    // ── Step 6: the A4 sheet (supervisors print it from the plate step).
    await page.getByRole('button', { name: 'تعبئة جديدة' }).click();
    await page.getByTestId('fillup-type-plate-instead').first().click();
    const [sheet] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/registration-sheet') && r.status() === 200),
      page.getByTestId('print-registration-sheet').click(),
    ]);
    const pdf = await sheet.body();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    writeFileSync(path.join(SHOTS, 'registration-stations-sheet.pdf'), pdf);

    // ── Step 4: deadline today needs the municipality name typed.
    const row = admin.locator('tr', { hasText: 'سبها' }).first();
    await row.getByRole('button', { name: 'تواريخ المراحل' }).click();
    const editor = admin.getByTestId('municipality-dates-editor');
    await editor.getByTestId('date-field-input').nth(0).fill('');
    await editor.getByTestId('date-field-input').nth(1).fill(tripoliDay(0));
    await expect(admin.getByTestId('municipality-dates-confirm')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'حفظ' })).toBeDisabled();
    await shot(admin, '07-deadline-today-needs-name');
    await admin.getByTestId('municipality-dates-confirm-name').fill('سبها');
    await editor.getByRole('button', { name: 'حفظ' }).click();
    await expect(editor).toHaveCount(0);

    // Refused after the deadline: an unregistered plate, with the stations list.
    await page.goto('/fillups/new');
    await page.getByTestId('fillup-type-plate-instead').first().click();
    const refusedSeq = `3${seq}`.slice(0, 7);
    await typePlateDigits(page, '7', refusedSeq);
    await page.getByTestId('fillup-record-unregistered').click();
    const refusal = page.getByTestId('fillup-card-required');
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('بدون بطاقة فعّالة');
    await expect(refusal).toContainText(fixtures.registrationStationName);
    await expect(page.getByTestId('fillup-unregistered-confirm-yes')).toBeDisabled();
    await shot(page, '08-refused-after-deadline');

    // ── Step 5: the supervisor's emergency override (reason required).
    await page.getByTestId('fillup-override-open').click();
    await expect(page.getByTestId('fillup-override-confirm')).toBeDisabled();
    await page.getByTestId('fillup-override-reason').fill('حالة إسعاف — سيارة طوارئ');
    await page.getByTestId('fillup-override-confirm').click();
    await expect(page.getByTestId('fillup-override-active')).toBeVisible();
    await page.getByTestId('fillup-unregistered-confirm-yes').click();
    await recordFromReview(page);
    await page.getByTestId('fillup-submit-mobile').click();
    await expect(page.getByTestId('fillup-success-override')).toBeVisible();
    await shot(page, '09-override-success');
  } finally {
    // Put the dates back (idempotent: no dates = grace indefinitely).
    try {
      await admin.goto('/admin/municipalities');
      const row = admin.locator('tr', { hasText: 'سبها' }).first();
      await row.getByRole('button', { name: 'تواريخ المراحل' }).click();
      const editor = admin.getByTestId('municipality-dates-editor');
      await editor.getByTestId('date-field-input').nth(0).fill('');
      await editor.getByTestId('date-field-input').nth(1).fill('');
      await editor.getByRole('button', { name: 'حفظ' }).click();
      await expect(editor).toHaveCount(0);
      await shot(admin, '10-dates-restored');
    } catch (error) {
      console.warn('[grace.spec] could not restore the municipality dates through the UI:', error);
    }
    await registrarCtx.close();
    await adminCtx.close();
  }
});
