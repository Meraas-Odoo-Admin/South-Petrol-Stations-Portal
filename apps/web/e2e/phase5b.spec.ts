import { mkdirSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { api, API_BASE } from './env';
import { loadFixtures, loginAs, navigateInApp } from './helpers';

// Phase 5B browser pass: fuel storage (set-up, delivery, the level, low-stock,
// reset with its confirmation — in «مراقبة المحطات», after review 19 Oct 2026), the bell with
// real notifications, each role's reports, a station's and an office's tabs,
// the summary row and the readiness panel, and the person page with the
// switch and the locked permissions. Screenshots (desktop and 390 px) go to
// docs/phase-5b-screenshots. One login per role: POST /auth/login is throttled.
const fixtures = loadFixtures();
const SHOTS = path.resolve(process.cwd(), '..', '..', 'docs', 'phase-5b-screenshots');
mkdirSync(SHOTS, { recursive: true });

async function shots(page: Page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

// One report table is shown at a time (UX round): a chooser lists them. Open the
// one asked for if it is not the first.
async function showTable(page: Page, id: string) {
  // Wait for the report to arrive (its first table), then pick the one asked for
  // (retried: the page may still be settling when the first click lands).
  await page.locator('[data-testid^="ops-table-"]').first().waitFor();
  await expect(async () => {
    const chooser = page.getByTestId(`ops-report-${id}`);
    if (await chooser.count()) await chooser.click();
    await expect(page.getByTestId(`ops-table-${id}`)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiLogin(username: string, password: string, attempt = 1): Promise<string> {
  try {
    const res = await api.post<{ accessToken: string }>(`${API_BASE}/auth/login`, { username, password });
    return res.data.accessToken;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 429 && attempt <= 6) {
      await sleep(15_000);
      return apiLogin(username, password, attempt + 1);
    }
    throw error;
  }
}

async function newPage(browser: Browser) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

const employeeUsername = `pw_p5b_emp_${fixtures.runId}`;
let supervisorToken = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const top = await apiLogin('sysadmin1', fixtures.sysadminPassword);
  const headers = { Authorization: `Bearer ${top}` };
  const jobs = await api.get<Array<{ id: string; name: string }>>(`${API_BASE}/roles`, { headers });
  const employeeJob = jobs.data.find((j) => j.name === 'station_employee');
  if (!employeeJob) throw new Error('station_employee role missing');
  await api.post(
    `${API_BASE}/users`,
    {
      username: employeeUsername,
      fullName: `موظف محطة ${employeeUsername.slice(-4)}`,
      roleId: employeeJob.id,
      placeIds: [fixtures.stationId],
      password: 'InitialPassword123!',
    },
    { headers },
  );
  const first = await apiLogin(employeeUsername, 'InitialPassword123!');
  await api.post(
    `${API_BASE}/auth/change-password`,
    { currentPassword: 'InitialPassword123!', newPassword: fixtures.supervisorPassword },
    { headers: { Authorization: `Bearer ${first}` } },
  );
  supervisorToken = await apiLogin(fixtures.supervisorUsername, fixtures.supervisorPassword);
});

// After review (19 Oct 2026): the supervisor chooses the fuels the station sells
// and sees its tanks read-only; the tanks, the deliveries and the reset are the
// municipality manager's, in «مراقبة المحطات» (the next test).
test('supervisor: fuel types, and the station\'s tanks read-only', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  await page.getByRole('link', { name: 'محطتي' }).first().click();
  await expect(page).toHaveURL(/\/my-station/);
  await expect(page.getByTestId('tab-overview')).toBeVisible();
  await shots(page, '10-my-station-overview');

  // The station's fuel types: petrol and diesel.
  for (const label of ['بنزين 95', 'ديزل']) {
    const box = page.locator('label', { hasText: label }).locator('input[type="checkbox"]').first();
    if (!(await box.isChecked())) await box.check();
  }
  await page.getByRole('button', { name: 'حفظ أنواع الوقود' }).click();
  await expect(page.getByText('تم حفظ أنواع الوقود.')).toBeVisible();

  await page.getByTestId('tab-fuel').click();
  await expect(page.getByTestId('fuel-stock-panel')).toBeVisible();
  await shots(page, '11-fuel-not-set-up');
  // No lever on the tanks, and no «إظهار المخزون للموظفين» switch.
  await expect(page.getByTestId('fuel-setup-PETROL_95')).toHaveCount(0);
  await expect(page.getByTestId('stock-visibility-switch')).toHaveCount(0);
  await context.close();
});

test('municipality manager: «مراقبة المحطات» — two tanks, a delivery, a low-stock alert, a correction and the reset', async ({ browser }) => {
  test.setTimeout(360_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  await page.getByRole('link', { name: 'مراقبة المحطات' }).first().click();
  await expect(page).toHaveURL(/\/monitoring$/);
  await expect(page.getByTestId('monitor-summary')).toBeVisible();
  await shots(page, '10b-monitoring');
  await page.getByTestId(`monitor-station-${fixtures.stationId}`).click();
  await expect(page).toHaveURL(new RegExp(`/monitoring/stations/${fixtures.stationId}`));
  await expect(page.getByTestId('fuel-stock-panel')).toBeVisible();

  // Two tanks. Diesel opens just above the 1,000 L line.
  await page.getByTestId('fuel-setup-PETROL_95').click();
  await page.getByLabel('سعة الخزان (لتر)').fill('30000');
  await page.getByLabel(/المستوى الحالي عند بدء/).fill('12000');
  await shots(page, '12-tank-setup-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByTestId('fuel-level-PETROL_95')).toContainText('12,000');

  await page.getByTestId('fuel-setup-DIESEL').click();
  await page.getByLabel('سعة الخزان (لتر)').fill('20000');
  await page.getByLabel(/المستوى الحالي عند بدء/).fill('1500');
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByTestId('fuel-level-DIESEL')).toContainText('1,500');

  // Two fill-ups of diesel bring it below 1,000 L: one alert.
  for (const [index, liters] of [300, 300].entries()) {
    await api.post(
      `${API_BASE}/fillups`,
      { cardNumber: fixtures.extraCardNumbers[index], stationId: fixtures.stationId, fuelType: 'DIESEL', quantityLiters: liters },
      { headers: { Authorization: `Bearer ${supervisorToken}`, 'Idempotency-Key': randomUUID() } },
    );
  }
  await page.reload();
  await expect(page.getByTestId('fuel-level-DIESEL')).toContainText('900');
  await expect(page.getByTestId('fuel-card-DIESEL')).toContainText('منخفض');
  await shots(page, '13-low-stock');

  // A delivery.
  await page.getByTestId('fuel-deliver-DIESEL').click();
  await page.getByTestId('delivery-liters').fill('5000');
  await page.getByTestId('delivery-plate').fill('5-246810');
  await page.getByTestId('delivery-waybill').fill('WB-2026-01');
  await page.getByLabel('اسم السائق (اختياري)').fill('سالم');
  await shots(page, '14-delivery-dialog');
  await page.getByTestId('delivery-save').click();
  await expect(page.getByTestId('fuel-level-DIESEL')).toContainText('5,900');
  await expect(page.getByTestId('fuel-entries')).toContainText('WB-2026-01');
  await shots(page, '15-after-delivery');

  // A correction of that delivery (a linked entry, the original kept).
  await page.getByRole('button', { name: 'تصحيح' }).first().click();
  await page.getByLabel('الكمية الصحيحة (لتر)').fill('4800');
  await page.getByLabel('سبب التصحيح').fill('البوليصة تُظهر 4800 لتر');
  await page.getByRole('button', { name: 'حفظ التصحيح' }).click();
  await expect(page.getByTestId('fuel-entries')).toContainText('مصحَّح');
  await shots(page, '16-corrected-delivery');

  // The reset: a dialog with the fuel, the level, a reason and the typed word.
  await page.getByTestId('fuel-reset-PETROL_95').click();
  const dialog = page.getByTestId('reset-dialog');
  await expect(dialog).toContainText('بنزين 95');
  await expect(page.getByTestId('reset-confirm')).toBeDisabled();
  await page.getByLabel('سبب التصفير (مطلوب)').fill('جرد فعلي أظهر الخزان فارغًا');
  await page.getByTestId('reset-word').fill('خطأ');
  await expect(page.getByTestId('reset-confirm')).toBeDisabled();
  await page.getByTestId('reset-word').fill('تصفير');
  await shots(page, '17-reset-confirmation');
  await page.getByTestId('reset-confirm').click();
  await expect(page.getByTestId('fuel-level-PETROL_95')).toContainText('0');
  await shots(page, '18-after-reset');

  // Every fill-up of the day, from the same screen.
  await page.getByTestId('tab-fillups').click();
  await expect(page.getByTestId('daily-export-csv')).toBeVisible();
  await context.close();
});

// After review (Khalil, 15 Oct 2026): the station employee records fill-ups
// and nothing else. Even with the stock shown, they see no stock, no bell, no
// records and no reports: the app opens on «تسجيل تعبئة», its only screen.
test('station employee: only «تسجيل تعبئة» — no home, stock, bell, records or reports', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, employeeUsername, fixtures.supervisorPassword, '/fillups/new');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('stock-strip')).toHaveCount(0);
  await expect(page.locator('[data-testid="notification-bell"]')).toHaveCount(0);
  const menu = page.locator('aside nav a');
  await expect(menu).toHaveCount(1);
  await expect(menu.first()).toContainText('تسجيل تعبئة');
  await shots(page, '20-employee-recording-only');

  // Any other address brings them back to their one screen.
  for (const address of ['/', '/vehicles', '/stations', '/reports']) {
    await page.evaluate(
      `window.history.pushState({}, '', ${JSON.stringify(address)}); window.dispatchEvent(new PopStateEvent('popstate'));`,
    );
    await expect(page, `${address} is not theirs`).toHaveURL(/\/fillups\/new$/);
  }
  await context.close();
});

test('supervisor: the bell, the station reports with a CSV export, and the person page', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, fixtures.supervisorUsername, fixtures.supervisorPassword);

  // Real notifications from the steps above.
  await expect(page.locator('[data-testid="notification-count"]:visible')).toBeVisible();
  await page.locator('[data-testid="notification-bell"]:visible').click();
  await expect(page.getByTestId('notification-panel')).toContainText('مخزون');
  await shots(page, '30-supervisor-bell');
  await page.getByTestId('notification-read-all').click();
  await expect(page.locator('[data-testid="notification-count"]:visible')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'التقارير' }).first().click();
  await expect(page).toHaveURL(/\/reports/);
  await showTable(page, 'storage');
  await shots(page, '31-supervisor-station-reports');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('ops-export-storage').click()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);

  // The employee's page: the switch, and the permissions grouped and locked.
  await navigateInApp(page, '/my-station?tab=staff');
  await page.getByRole('link', { name: /موظف محطة/ }).first().click();
  await expect(page.getByTestId('account-active-switch')).toBeVisible();
  await shots(page, '32-person-active-switch');
  // A supervisor has no lever on permissions: the card is not there at all.
  await expect(page.getByTestId('permissions-toggle')).toHaveCount(0);
  await context.close();
});

test('municipality manager: the summary row, a station and an office, and the reports', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  await page.getByRole('link', { name: 'إدارة المحطات' }).first().click();
  await expect(page).toHaveURL('/manage');
  await expect(page.getByTestId('place-summary')).toBeVisible();
  await expect(page.getByTestId('readiness-panel')).toHaveCount(0); // Phase 6: removed
  await expect(page.getByTestId('summary-low-stock')).toBeVisible();
  await shots(page, '40-manage-summary');

  // A station: overview, staff, fuel and stock, reports.
  // The list is paged (25 a page): search for the one wanted.
  await page.locator('#pl-st-search').fill(fixtures.stationName);
  await page.getByRole('link', { name: fixtures.stationName }).first().click();
  await expect(page.getByTestId('tab-overview')).toBeVisible();
  await shots(page, '41-station-overview');
  await page.getByTestId('tab-fuel').click();
  await expect(page.getByTestId('fuel-stock-panel')).toBeVisible();
  // The station's page shows the figures; the levers are in «مراقبة المحطات».
  await expect(page.getByTestId('fuel-deliver-DIESEL')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'مراقبة المحطات' }).last()).toBeVisible();
  await shots(page, '42-station-fuel-tab-manager');
  await page.getByTestId('tab-reports').click();
  await showTable(page, 'days');
  await shots(page, '43-station-reports-tab');

  // The supervisor's own page: the active switch, and the permissions grouped
  // by area with the job's ticked and locked.
  await page.getByTestId('tab-staff').click();
  await page.locator('main a[href^="/people/"]').first().click();
  await expect(page.getByTestId('account-active-switch')).toBeVisible();
  await shots(page, '49a-person-active-switch');
  await page.getByTestId('permissions-toggle').click();
  await expect(page.getByTestId('permissions-body')).toBeVisible();
  await expect(page.getByTestId('permission-locked-fuel_stock:read')).toContainText('من الوظيفة');
  await shots(page, '49b-person-permissions-locked');
  await navigateInApp(page, '/manage');
  // The list is paged (25 a page): search for the one wanted.
  await page.locator('#pl-st-search').fill(fixtures.stationName);
  await page.getByRole('link', { name: fixtures.stationName }).first().click();

  // An office: overview and staff (Phase 7: no desks and printers).
  await navigateInApp(page, '/manage');
  // Phase 7: offices are their own tab. The list is paged: search for the one wanted.
  await page.getByTestId('tab-offices').click();
  await page.locator('#pl-of-search').fill(fixtures.registrationStationName);
  await page.getByRole('link', { name: fixtures.registrationStationName }).first().click();
  await expect(page.getByTestId('tab-overview')).toBeVisible();
  await shots(page, '44-office-overview');
  // Phase 6: no «البطاقات والمخزون» tab on an office any more.
  await expect(page.getByTestId('tab-cards')).toHaveCount(0);
  await expect(page.getByTestId('tab-desks')).toHaveCount(0);

  // The role reports: the municipality's.
  await navigateInApp(page, '/reports?report=municipality');
  await showTable(page, 'fuel-reconciliation');
  await shots(page, '47-municipality-reports');

  // The office report's PDF.
  await navigateInApp(page, '/reports?report=office');
  await showTable(page, 'office');
  const [officePdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'تنزيل PDF' }).click(),
  ]);
  expect(officePdf.suggestedFilename()).toMatch(/\.pdf$/);
  await officePdf.saveAs(path.join(SHOTS, 'office-report.pdf'));

  await page.locator('[data-testid="notification-bell"]:visible').click();
  await expect(page.getByTestId('notification-panel')).toBeVisible();
  await shots(page, '48-municipality-manager-bell');
  await context.close();
});

test('office manager and registration employee: their office, their day, their bell', async ({ browser }) => {
  test.setTimeout(240_000);
  const om = await newPage(browser);
  await loginAs(om.page, fixtures.officeManagerUsername, fixtures.officeManagerPassword);
  await om.page.getByRole('link', { name: 'مكتبي' }).first().click();
  await expect(om.page).toHaveURL(/\/my-office/);
  await expect(om.page.getByTestId('tab-overview')).toBeVisible();
  await shots(om.page, '50-my-office-overview');
  await expect(om.page.getByTestId('tab-cards')).toHaveCount(0);
  await om.page.getByRole('link', { name: 'التقارير' }).first().click();
  await showTable(om.page, 'employees');
  await shots(om.page, '52-office-reports');
  await om.page.locator('[data-testid="notification-bell"]:visible').click();
  await shots(om.page, '53-office-manager-bell');
  await om.context.close();

  const reg = await newPage(browser);
  await loginAs(reg.page, fixtures.registrarUsername, fixtures.registrarPassword);
  await reg.page.getByRole('link', { name: 'التقارير' }).first().click();
  await showTable(reg.page, 'summary');
  await shots(reg.page, '54-registration-employee-day');
  await reg.page.locator('[data-testid="notification-bell"]:visible').click();
  await expect(reg.page.getByTestId('notification-panel')).toBeVisible();
  await shots(reg.page, '55-registration-employee-bell');
  await reg.context.close();
});

test('super admin: one municipality with its summary and reports, the comparison, and the switches', async ({ browser }) => {
  test.setTimeout(300_000);
  const { context, page } = await newPage(browser);
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);

  await navigateInApp(page, `/admin/municipalities/${fixtures.municipalityId}`);
  await expect(page.getByTestId('place-summary')).toBeVisible();
  await expect(page.getByTestId('readiness-sentence')).toHaveCount(0);
  await shots(page, '60-municipality-summary');

  await navigateInApp(page, '/reports?report=summary');
  await showTable(page, 'municipalities');
  await shots(page, '61-cross-municipality-summary');

  await navigateInApp(page, '/admin/settings');
  await expect(page.getByTestId('rule-switches')).toBeVisible();
  await shots(page, '62-rule-switches-shared-switch');

  await page.locator('[data-testid="notification-bell"]:visible').click();
  await expect(page.getByTestId('notification-panel')).toBeVisible();
  await shots(page, '63-super-admin-bell');
  await context.close();
});
