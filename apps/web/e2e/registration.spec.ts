import { test, expect } from '@playwright/test';
import { fillDigitBoxes, loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

// Phase 5A: the vehicle's required fields, in the order they are filled in.
async function fillVehicleDetails(page: import('@playwright/test').Page) {
  const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  const rnd = (n: number) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  await page.getByTestId('registration-chassis-input').fill(rnd(17));
  // Phase 7: the booklet number is digits only; the year is a list.
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  await page.getByTestId('registration-booklet-input').fill(digits(8));
  await page.getByTestId('registration-make').fill('تويوتا');
  await page.getByTestId('registration-model').fill('هايلكس');
  await page.getByTestId('registration-color').selectOption('ابيض');
  await page.getByTestId('registration-year').selectOption('2020');
  await page.getByTestId('registration-fuel').selectOption('PETROL');
}

// Registration pivot, phase 2 — the registration employee's workspace.
// One login for the whole flow (POST /auth/login is throttled to 5/min per
// app instance — see the other specs' notes).
test('registration employee registers a new owner and vehicle, and a duplicate plate is caught', async ({ page }) => {
  await loginAs(page, fixtures.registrarUsername, fixtures.registrarPassword);

  // Separation of duties: a registration employee has no fill-up screen.
  await expect(page.getByRole('link', { name: 'تسجيل تعبئة', exact: true })).toHaveCount(0);

  await page.locator('aside').getByRole('link', { name: 'تسجيل المركبات' }).click();
  await expect(page).toHaveURL('/registration');

  // Scoped to exactly one registration station — it's filled in, no picker.
  await expect(page.getByTestId('registration-station-select')).toHaveCount(0);
  await expect(page.getByTestId('registration-station-current')).toContainText(fixtures.registrationStationName);

  // ── Owner first: a fresh identity is not found, so register it ───────
  const random = (n: number) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
  const identity = `119${random(9)}`;
  const ownerName = 'مالك مسجَّل بالاختبار';
  await fillDigitBoxes(page, 'registration-identity-input', identity);
  await page.getByTestId('registration-owner-search').click();
  await expect(page.getByTestId('registration-owner-new')).toBeVisible();
  await page.getByTestId('registration-owner-name').fill(ownerName);
  await page.getByTestId('registration-owner-phone').fill('0912345678');
  await page.getByTestId('registration-owner-save').click();
  await expect(page.getByTestId('registration-owner-selected')).toContainText(ownerName);

  // ── Then the vehicle ─────────────────────────────────────────────────
  const plateSeq = random(7);
  await fillDigitBoxes(page, 'registration-plate-input', '7');
  await fillDigitBoxes(page, 'registration-plate-input', plateSeq, 2);
  await fillVehicleDetails(page);
  await page.getByTestId('registration-vehicle-save').click();

  await expect(page.getByTestId('registration-success')).toContainText('تم تسجيل المركبة');
  await expect(page.getByTestId('registration-success')).toContainText(ownerName);

  // ── Phase 3: issue and print the card at the office ──────────────
  // Phase 7: no desk to pick; the black-only ribbon is the one device setting.
  await expect(page.getByTestId('card-printer-settings')).toBeVisible();
  await expect(page.getByTestId('card-desk-select')).toHaveCount(0);
  await page.getByTestId('card-issue').click();
  const firstNumber = (await page.getByTestId('card-issued-number').innerText()).trim();
  expect(firstNumber).toMatch(/^SBH-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  await expect(page.getByTestId('card-preview-image')).toBeVisible();
  await page.getByTestId('card-print').click();

  // "Was it printed correctly?" — No: that card is cancelled and a new
  // number is issued and printed straight away.
  await expect(page.getByTestId('card-print-confirm')).toContainText('هل طُبعت البطاقة بشكل سليم؟');
  await page.getByTestId('card-print-failed').click();
  await expect(page.getByTestId('card-issued-number')).not.toHaveText(firstNumber);
  const secondNumber = (await page.getByTestId('card-issued-number').innerText()).trim();
  expect(secondNumber).toMatch(/^SBH-/);
  await expect(page.getByTestId('card-print-confirm')).toBeVisible();
  await page.getByTestId('card-print-ok').click();
  await expect(page.getByTestId('card-done')).toBeVisible();

  // ── Same plate again, for the owner just registered: caught ──────────
  await page.getByRole('button', { name: 'تسجيل مركبة أخرى' }).click();
  await fillDigitBoxes(page, 'registration-identity-input', identity);
  await page.getByTestId('registration-owner-search').click();
  // Found this time — picked, not re-created.
  await expect(page.getByTestId('registration-owner-found')).toContainText(ownerName);
  await page.getByTestId('registration-owner-pick').click();

  await fillDigitBoxes(page, 'registration-plate-input', '7');
  await fillDigitBoxes(page, 'registration-plate-input', plateSeq, 2);
  await fillVehicleDetails(page);

  // Flagged before saving, naming the vehicle it already belongs to.
  const warning = page.getByTestId('registration-duplicate-currentPlate');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('رقم اللوحة مسجّل مسبقًا');
  await expect(warning).toContainText(`7 - ${plateSeq}`);

  // And saving is refused with a clear message.
  await page.getByTestId('registration-vehicle-save').click();
  await expect(page.getByTestId('registration-vehicle-error')).toContainText('مسجّلة مسبقًا');
  await expect(page.getByTestId('registration-success')).toHaveCount(0);
});
