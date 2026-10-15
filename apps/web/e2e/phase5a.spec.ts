import { mkdirSync } from 'fs';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { fillDigitBoxes, loadFixtures, loginAs, navigateInApp } from './helpers';

const fixtures = loadFixtures();

// Phase 5A browser pass: every level creating the level below it from inside
// its own place, archive and restore, the rule switches, and the owner forms
// with each national-ID error in Arabic. Screenshots (desktop and 390 px) go
// to docs/phase-5a-screenshots. One login per role (POST /auth/login is
// throttled, see the other specs).
const SHOTS = path.resolve(process.cwd(), '..', '..', 'docs', 'phase-5a-screenshots');
mkdirSync(SHOTS, { recursive: true });

async function shots(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

const LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const tag = (n: number) => Array.from({ length: n }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
const random = (n: number) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');

test.describe.configure({ mode: 'serial' });

test('super admin: creates a municipality (its directorate appears by itself) and its manager', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);

  await navigateInApp(page, '/admin/municipalities');
  await expect(page.getByRole('heading', { name: 'إدارة البلديات' })).toBeVisible();
  await shots(page, '01-municipalities-list');

  const name = `بلدية اختبار ${tag(5)}`;
  await page.getByRole('button', { name: 'بلدية جديدة' }).click();
  await page.getByTestId('municipality-create-name').fill(name);
  await page.getByTestId('municipality-create-save').click();

  // The security directorate was created with it, named after it.
  await expect(page.getByText(`مديرية أمن ${name}`).first()).toBeVisible();
  await shots(page, '02-municipality-created-with-directorate');

  // Its manager is created here, already assigned to this municipality.
  await page.getByRole('link', { name: 'إضافة مدير بلدية' }).first().click();
  await expect(page).toHaveURL(/\/people\/new\?/);
  await page.getByLabel('الاسم الكامل').fill(`مدير ${tag(5)}`);
  await page.getByLabel('اسم المستخدم').fill(`pw_mm_${fixtures.runId}_${random(3)}`);
  await shots(page, '03-new-municipality-manager-form');
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByTestId('temporary-password')).toBeVisible();
  await shots(page, '04-municipality-manager-created');

  // The rule switches live in settings.
  await navigateInApp(page, '/admin/settings');
  await expect(page.getByTestId('rule-switches')).toBeVisible();
  const liters = page.getByTestId('rule-switch-fillup.rule.owner_liters.enabled');
  await expect(liters).toHaveAttribute('aria-checked', 'false');
  await shots(page, '05-rule-switches');
  await liters.click();
  await expect(liters).toHaveAttribute('aria-checked', 'true');
  await liters.click();
  await expect(liters).toHaveAttribute('aria-checked', 'false');
  await context.close();
});

test('municipality manager: station, its supervisor, an office manager, archive and restore', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  await page.getByRole('link', { name: 'إدارة المحطات' }).first().click();
  await expect(page).toHaveURL('/manage');
  // No people-management list and no security-authorities section. Phase 7: «الإدارة»
  // is there, holding only «القوائم» — not the super admin's municipalities or settings.
  await expect(page.getByRole('link', { name: 'البلديات', exact: true })).toHaveCount(0);
  await shots(page, '10-manage-places');

  // A new station (Phase 7: the «إضافة» of the stations tab).
  await page.getByTestId('stations-list-add').click();
  await expect(page).toHaveURL('/manage/stations/new');
  const stationName = `محطة اختبار ${tag(5)}`;
  await page.locator('#st-company').selectOption({ index: 1 });
  await page.getByLabel('رقم المحطة لدى الشركة').fill(`${random(3)}`);
  await page.getByLabel('اسم المحطة').fill(stationName);
  await shots(page, '11-new-station-form');
  await page.getByRole('button', { name: 'حفظ المحطة' }).click();
  await expect(page.getByRole('heading', { name: stationName })).toBeVisible();

  // Its supervisor, created from inside the station (the place is fixed).
  // Phase 5B: the people of a place are in its «الموظفون» tab.
  await page.getByTestId('tab-staff').click();
  await page.getByRole('button', { name: /حساب جديد/ }).first().click();
  await expect(page).toHaveURL(/kind=PETROL_STATION/);
  await page.getByLabel('الاسم الكامل').fill(`مشرف ${tag(5)}`);
  await page.getByLabel('اسم المستخدم').fill(`pw_stsup_${fixtures.runId}_${random(3)}`);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByTestId('temporary-password')).toBeVisible();
  await shots(page, '12-station-supervisor-created');

  // Back to the station: archive it, find it under the archived filter, restore it.
  await page.getByRole('button', { name: 'العودة إلى القائمة' }).click();
  await expect(page.getByRole('heading', { name: stationName })).toBeVisible();
  await page.getByTestId('tab-overview').click();
  await page.getByRole('button', { name: 'أرشفة المحطة' }).click();
  await page.getByLabel('السبب (مطلوب)').fill('تجربة الأرشفة');
  await page.getByRole('dialog').getByRole('button', { name: 'أرشفة', exact: true }).click();
  await expect(page.getByText('هذه المحطة مؤرشف')).toBeVisible();
  await shots(page, '13-station-archived');
  await page.getByRole('button', { name: 'استعادة المحطة' }).click();
  await page.getByLabel('السبب (مطلوب)').fill('عودة للعمل');
  await page.getByRole('dialog').getByRole('button', { name: 'استعادة', exact: true }).click();
  await expect(page.getByRole('button', { name: 'أرشفة المحطة' })).toBeVisible();

  // The office manager of the fixture office.
  await navigateInApp(page, '/manage');
  // Phase 7: offices are their own tab. The list is paged: search for the one wanted.
  await page.getByTestId('tab-offices').click();
  await page.locator('#pl-of-search').fill(fixtures.registrationStationName);
  await page.getByRole('link', { name: fixtures.registrationStationName }).first().click();
  await expect(page.getByRole('heading', { name: fixtures.registrationStationName })).toBeVisible();
  // Phase 5B: the people of a place are in its «الموظفون» tab.
  await page.getByTestId('tab-staff').click();
  await page.getByRole('button', { name: /حساب جديد/ }).first().click();
  await expect(page).toHaveURL(/kind=REGISTRATION/);
  await page.getByLabel('الاسم الكامل').fill(`مدير مكتب ${tag(4)}`);
  await page.getByLabel('اسم المستخدم').fill(`pw_off_${fixtures.runId}_${random(3)}`);
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByTestId('temporary-password')).toBeVisible();
  await shots(page, '14-office-manager-created');
  await context.close();
});

test('station supervisor creates an employee in «محطتي»; office manager one in «مكتبي»', async ({ browser }) => {
  test.setTimeout(240_000);
  const supContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const sup = await supContext.newPage();
  await loginAs(sup, fixtures.supervisorUsername, fixtures.supervisorPassword);
  await sup.getByRole('link', { name: 'محطتي' }).first().click();
  await expect(sup).toHaveURL('/my-station');
  await shots(sup, '20-my-station');
  await sup.getByTestId('tab-staff').click();
  await sup.getByRole('button', { name: /حساب جديد/ }).first().click();
  await sup.getByLabel('الاسم الكامل').fill(`موظف ${tag(5)}`);
  await sup.getByLabel('اسم المستخدم').fill(`pw_emp_${fixtures.runId}_${random(3)}`);
  await sup.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(sup.getByTestId('temporary-password')).toBeVisible();
  await shots(sup, '21-station-employee-created');
  await supContext.close();

  const omContext = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const om = await omContext.newPage();
  await loginAs(om, fixtures.officeManagerUsername, fixtures.officeManagerPassword);
  await om.getByRole('link', { name: 'مكتبي' }).first().click();
  await expect(om).toHaveURL('/my-office');
  await shots(om, '22-my-office');
  await om.getByTestId('tab-staff').click();
  await om.getByRole('button', { name: /حساب جديد/ }).first().click();
  await om.getByLabel('الاسم الكامل').fill(`موظف تسجيل ${tag(4)}`);
  await om.getByLabel('اسم المستخدم').fill(`pw_regemp_${fixtures.runId}_${random(3)}`);
  await om.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(om.getByTestId('temporary-password')).toBeVisible();
  await shots(om, '23-registration-employee-created');
  await omContext.close();
});

test('registration: every national-ID rule in Arabic, and no institution choice', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginAs(page, fixtures.registrarUsername, fixtures.registrarPassword);
  await page.locator('aside').getByRole('link', { name: 'تسجيل المركبات' }).click();
  await expect(page).toHaveURL('/registration');

  const error = page.getByTestId('registration-identity-error');
  const year = new Date().getFullYear();
  const cases: Array<[string, string, string]> = [
    ['first-digit', '319900123456', 'يجب أن يبدأ بالرقم 1 (ذكر) أو 2 (أنثى)'],
    ['year-1899', '118990123456', 'سنة الميلاد في الرقم الوطني (1899) غير صحيحة'],
    ['future-year', `1${year + 1}0123456`, `سنة الميلاد في الرقم الوطني (${year + 1}) غير صحيحة`],
    ['under-18', `1${year - 10}0123456`, 'عمره أقل من 18 سنة'],
  ];
  for (const [name, number, message] of cases) {
    await fillDigitBoxes(page, 'registration-identity-input', number);
    await expect(error).toContainText(message);
    await shots(page, `30-national-id-error-${name}`);
  }
  // A valid number clears the error and the search is allowed.
  await fillDigitBoxes(page, 'registration-identity-input', `119${random(9)}`);
  await expect(error).toHaveCount(0);

  // Phase 6: only individuals are registered; there is no فرد / جهة choice.
  await expect(page.getByTestId('registration-owner-kind-institution')).toHaveCount(0);
  await expect(page.getByTestId('registration-institution')).toHaveCount(0);
  await expect(page.getByText('جهة / مؤسسة')).toHaveCount(0);
  await shots(page, '31-registration-individual-only');
  await context.close();
});
