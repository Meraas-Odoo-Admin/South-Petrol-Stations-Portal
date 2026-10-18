import { test, expect, type Browser, type Page } from '@playwright/test';
import { fillDigitBoxes, loadFixtures, loginAs, navigateInApp } from './helpers';

// Phase 7 (Mohamed's review, 14 Oct 2026), the screens: «اليوم» for a
// municipality manager, one date control, calendars inside the screen, tabs
// without scrollbars, the registration fields, the settings page and
// «القوائم» inside «الإدارة». One login per role: POST /auth/login is throttled.
const fixtures = loadFixtures();

async function open(browser: Browser, width = 1280, height = 900) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height } });
  return { context, page: await context.newPage() };
}

// The calendar of the LAST date field on the page, opened, must sit fully
// inside the viewport with a margin.
async function expectCalendarOnScreen(page: Page) {
  // Start closed: focusing a date field already opens its calendar.
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(page.getByTestId('date-field-calendar')).toHaveCount(0);
  const toggles = page.getByTestId('date-field-calendar-toggle');
  await toggles.last().scrollIntoViewIfNeeded();
  await toggles.last().click();
  const calendar = page.getByTestId('date-field-calendar');
  await expect(calendar).toBeVisible();
  const box = (await calendar.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
}

test('municipality manager: «اليوم» with «جميع المحطات» works, with one date control that stays on screen', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);
  await navigateInApp(page, '/reports/daily');

  // 4.1: all the stations of the municipality, no station picked, no error.
  await expect(page.getByTestId('directorate-overview')).toBeVisible();
  await expect(page.getByTestId('daily-report-error')).toHaveCount(0);
  await expect(page.getByText('تأكد من اختيار محطة')).toHaveCount(0);

  // 4.2: one date control; the directorate section follows it.
  await expect(page.getByTestId('date-field-input')).toHaveCount(1);
  await expect(page.getByTestId('directorate-overview-window')).toContainText('آخر 30 يومًا');

  // A cleared date is never sent: the page says what to do instead of failing.
  await page.getByTestId('date-field-input').fill('');
  await expect(page.getByTestId('daily-date-incomplete')).toBeVisible();
  await expect(page.getByTestId('daily-report-error')).toHaveCount(0);

  // 4.3: the calendar stays inside the screen, desktop and 390 px.
  await expectCalendarOnScreen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCalendarOnScreen(page);
  await context.close();
});

test('municipality manager: places in two tabs, tabs without a scrollbar, «القوائم» inside «الإدارة»', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  // 5: two lists, each with its own «إضافة».
  await navigateInApp(page, '/manage');
  await expect(page.getByTestId('stations-list')).toBeVisible();
  await expect(page.getByTestId('stations-list-add')).toContainText('إضافة محطة وقود');
  await expect(page.getByTestId('stations-list')).not.toContainText('مكتب تسجيل');
  await page.getByTestId('tab-offices').click();
  await expect(page.getByTestId('offices-list')).toBeVisible();
  await expect(page.getByTestId('offices-list-add')).toContainText('إضافة مكتب تسجيل');

  // 4.4: a tab bar never scrolls on a desktop.
  const tablist = page.getByRole('tablist').first();
  const overflow = await tablist.evaluate((el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Audit P0: a dialog's reason field keeps focus while it is typed into, one key
  // at a time (it used to lose focus after every character).
  await navigateInApp(page, `/manage/stations/${fixtures.stationId}`);
  await page.getByRole('button', { name: 'أرشفة المحطة' }).click();
  const reason = page.getByLabel('السبب (مطلوب)');
  await reason.click();
  await reason.pressSequentially('سبب مكتوب حرفًا حرفًا');
  await expect(reason).toHaveValue('سبب مكتوب حرفًا حرفًا');
  await expect(reason).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // 6.5: «القوائم» is a tab of «الإدارة», not a menu item.
  await expect(page.locator('aside').getByRole('link', { name: 'القوائم' })).toHaveCount(0);
  await page.locator('aside').getByRole('link', { name: 'الإدارة' }).click();
  await expect(page).toHaveURL(/\/admin\/lists/);
  await expect(page.getByTestId('exception-types-panel')).toBeVisible();
  await expect(page.getByText('يتطلب مرجع إثبات')).toHaveCount(0);
  await context.close();
});

test('registration employee: the 10-digit administrative number, no N, a year list, the plate change in digit boxes', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.registrarUsername, fixtures.registrarPassword);
  await navigateInApp(page, '/registration');

  await page.getByRole('button', { name: 'رقم إداري' }).click();
  await expect(page.locator('[data-testid^="registration-identity-input-box-"]')).toHaveCount(10);
  await fillDigitBoxes(page, 'registration-identity-input', '9');
  await expect(page.getByTestId('registration-identity-error')).toContainText('يبدأ بـ 5 (ذكر) أو 6 (أنثى)');

  await expect(page.getByTestId('registration-plate-n')).toHaveCount(0);
  const years = page.getByTestId('registration-year').locator('option');
  const nextYear = String(new Date().getFullYear() + 1);
  await expect(years.nth(1)).toHaveText(nextYear);
  await expect(years.last()).toHaveText('1950');
  await expect(page.getByTestId('registration-make')).toHaveAttribute('placeholder', 'مثال: تويوتا');
  await expect(page.getByTestId('registration-model')).toHaveAttribute('placeholder', 'مثال: كامري');

  // The 12-box national ID row fits a 390 px phone without scrolling.
  await page.getByRole('button', { name: 'رقم وطني' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const row = page.getByTestId('registration-identity-input').locator('div').first();
  const rowOverflow = await row.evaluate((el: { scrollWidth: number; clientWidth: number }) => el.scrollWidth - el.clientWidth);
  expect(rowOverflow).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1280, height: 900 });

  // After review (18 Oct 2026): no change requests on the vehicle page. A
  // registration employee's «تعديل» has the regular fields only; the plate,
  // chassis, booklet, type and owner are for the office manager and above.
  await navigateInApp(page, `/vehicles/${fixtures.vehicleId}`);
  await expect(page.getByText('طلب تغيير رقم اللوحة')).toHaveCount(0);
  await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
  await expect(page.getByTestId('vehicle-edit-make')).toBeVisible();
  await expect(page.getByTestId('vehicle-edit-plate')).toHaveCount(0);
  await context.close();
});

test('super admin: settings with units, no custom rules, no placeholder notes, week start only when used', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await open(browser);
  await loginAs(page, 'sysadmin1', fixtures.sysadminPassword);
  await navigateInApp(page, '/admin/settings');
  await expect(page.getByTestId('rule-switches')).toBeVisible();

  await expect(page.getByText('إضافة قاعدة رقمية جديدة')).toHaveCount(0);
  await expect(page.getByText('رقم مبدئي بانتظار تأكيد العميل')).toHaveCount(0);
  await expect(page.getByTestId('setting-value-fillup.max_per_week')).toContainText('في الأسبوع');
  await expect(page.getByTestId('setting-value-stock.low_threshold_liters')).toContainText('لتر');
  await expect(page.getByTestId('setting-value-fillup.price_per_liter.PETROL_95')).toContainText('دينار للتر');

  // The seed counts the week as «متجدد», so «يوم بداية الأسبوع» is hidden …
  await expect(page.getByTestId('setting-fillup.week_start_day')).toHaveCount(0);
  // … and appears as soon as «ثابت» is chosen (not saved).
  await page.getByRole('radio', { name: /ثابت/ }).click();
  await expect(page.getByTestId('setting-fillup.week_start_day')).toBeVisible();
  await context.close();
});

test('every list: 10 rows a page, the page in the address', async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await open(browser);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);

  // Server-paged: the vehicles list asks for 10 and says «1–10 من …».
  await navigateInApp(page, '/vehicles');
  const range = page.getByTestId('vehicles-pager-range');
  await expect(range).toBeVisible();
  const total = Number(((await range.innerText()).split('من')[1] ?? '').replace(/[^0-9]/g, ''));
  await expect(range).toContainText(`1–${Math.min(10, total)}`);

  // Paged on the screen (all rows already loaded): the municipalities list.
  await navigateInApp(page, '/admin/municipalities');
  const rows = page.locator('[data-testid^="municipality-row-"]');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThanOrEqual(10);
  const next = page.getByTestId('municipalities-pager-next');
  if (await next.count()) {
    const firstOnPage1 = await rows.first().getAttribute('data-testid');
    await next.click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows.first()).not.toHaveAttribute('data-testid', firstOnPage1!);
    expect(await rows.count()).toBeLessThanOrEqual(10);
  }
  await context.close();
});
