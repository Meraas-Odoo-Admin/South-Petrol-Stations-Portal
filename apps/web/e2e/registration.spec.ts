import { test, expect } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

const fixtures = loadFixtures();

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
  const identity = `1${random(11)}`;
  const ownerName = `PW Registered Owner ${fixtures.runId}`;
  await page.getByTestId('registration-identity-input-box-0').click();
  await page.keyboard.type(identity);
  await page.getByTestId('registration-owner-search').click();
  await expect(page.getByTestId('registration-owner-new')).toBeVisible();
  await page.getByTestId('registration-owner-name').fill(ownerName);
  await page.getByTestId('registration-owner-phone').fill('0912345678');
  await page.getByTestId('registration-owner-save').click();
  await expect(page.getByTestId('registration-owner-selected')).toContainText(ownerName);

  // ── Then the vehicle ─────────────────────────────────────────────────
  const plateSeq = random(7);
  await page.getByTestId('registration-plate-input-box-0').fill('7');
  await page.getByTestId('registration-plate-input-box-2').click();
  await page.keyboard.type(plateSeq);
  await page.getByTestId('registration-vehicle-save').click();

  await expect(page.getByTestId('registration-success')).toContainText('تم تسجيل المركبة');
  await expect(page.getByTestId('registration-success')).toContainText(ownerName);

  // ── Phase 3: issue and print the card at the desk ─────────────────
  // First visit on this device: pick the desk (then it's remembered).
  await page.getByTestId('card-desk-select').selectOption({ label: `${fixtures.deskName} — PW test printer` });
  await expect(page.getByTestId('card-desk-current')).toHaveText(fixtures.deskName);
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
  await page.getByTestId('registration-identity-input-box-0').click();
  await page.keyboard.type(identity);
  await page.getByTestId('registration-owner-search').click();
  // Found this time — picked, not re-created.
  await expect(page.getByTestId('registration-owner-found')).toContainText(ownerName);
  await page.getByTestId('registration-owner-pick').click();

  await page.getByTestId('registration-plate-input-box-0').fill('7');
  await page.getByTestId('registration-plate-input-box-2').click();
  await page.keyboard.type(plateSeq);

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
