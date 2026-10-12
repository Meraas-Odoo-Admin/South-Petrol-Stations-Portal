import { test, expect, type Browser, type Page } from '@playwright/test';
import { api, API_BASE } from './env';
import { loadFixtures, loginAs, navigateInApp, submitLogin } from './helpers';

// Phase 4b follow-up, from a real iPhone: the phone chrome and forms.
//  - no screen scrolls sideways at 320, 390 or 430px;
//  - every text field is at least 16px (below that iOS Safari zooms the page
//    and shifts the layout), and pinch-zoom is not disabled;
//  - the bottom bar is equal-width, one line, always labelled, with room for
//    the home indicator, for every kind of user;
//  - the phone menu and the home cards offer exactly the same destinations;
//  - a supervisor's pages raise no failed request (the violations badge used
//    to get a 400 on every page);
//  - the one-time temporary password stays on one line at every phone width.
const fixtures = loadFixtures();
const WIDTHS = [320, 390, 430] as const;
const TALL = 844;

interface Role {
  key: string;
  username: string;
  password: string;
  routes: string[];
  // Cards and menu entries this kind of user must see / must not see.
  mustSee: string[];
  mustNotSee: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// /auth/login is throttled to 5 a minute; retry on 429 like the setup does.
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

const employeeUsername = `pw_emp_${fixtures.runId}`;
// This file's own account that must still change its password: auth.spec.ts
// completes the change for the shared one, so it cannot be reused here.
const mustChangeUsername = `pw_phonechg_${fixtures.runId}`;
const MUST_CHANGE_PASSWORD = 'InitialPassword123!';
let roles: Role[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  const adminToken = await apiLogin(fixtures.adminUsername, fixtures.adminPassword);
  const headers = { Authorization: `Bearer ${adminToken}` };
  const jobs = await api.get<Array<{ id: string; name: string }>>(`${API_BASE}/roles`, { headers });
  const employeeJob = jobs.data.find((j) => j.name === 'station_employee');
  if (!employeeJob) throw new Error('station_employee role missing — was the seed run?');
  await api.post(
    `${API_BASE}/users`,
    {
      username: employeeUsername,
      fullName: `PW ${employeeUsername}`,
      roleId: employeeJob.id,
      placeIds: [fixtures.stationId],
      password: 'InitialPassword123!',
    },
    { headers },
  );
  await api.post(
    `${API_BASE}/users`,
    { username: mustChangeUsername, fullName: `PW ${mustChangeUsername}`, password: MUST_CHANGE_PASSWORD },
    { headers },
  );
  const first = await apiLogin(employeeUsername, 'InitialPassword123!');
  await api.post(
    `${API_BASE}/auth/change-password`,
    { currentPassword: 'InitialPassword123!', newPassword: fixtures.supervisorPassword },
    { headers: { Authorization: `Bearer ${first}` } },
  );

  roles = [
    {
      key: 'station employee',
      username: employeeUsername,
      password: fixtures.supervisorPassword,
      routes: ['/fillups/new', '/vehicles', '/stations'],
      mustSee: ['/fillups/new', '/vehicles'],
      mustNotSee: ['/admin', '/staff', '/registration', '/reports/readiness', '/reports/card-stock', '/reports/registration'],
    },
    {
      key: 'station supervisor',
      username: fixtures.supervisorUsername,
      password: fixtures.supervisorPassword,
      routes: ['/reports/violations', '/reports/daily', '/reports/readiness', '/staff', '/staff/new', '/fillups/new', '/vehicles'],
      mustSee: ['/staff', '/reports/violations', '/reports/readiness'],
      mustNotSee: ['/admin', '/registration', '/reports/card-stock', '/reports/registration'],
    },
    {
      key: 'registration employee',
      username: fixtures.registrarUsername,
      password: fixtures.registrarPassword,
      routes: ['/registration', '/vehicles'],
      mustSee: ['/registration', '/vehicles'],
      mustNotSee: ['/admin', '/staff', '/fillups/new', '/reports/readiness', '/reports/card-stock', '/reports/registration'],
    },
    {
      key: 'directorate admin',
      username: fixtures.adminUsername,
      password: fixtures.adminPassword,
      routes: [
        '/reports/dashboard',
        '/reports/violations',
        '/reports/registration',
        '/reports/card-stock',
        '/reports/readiness',
        '/vehicles/change-requests',
        '/admin/users',
        '/admin/users/new',
        '/admin/municipalities',
        '/admin/settings',
        '/admin/registration-stations',
        '/admin/security-authorities',
        '/admin/audit-log',
        '/stations',
      ],
      mustSee: ['/admin', '/reports/dashboard', '/reports/registration', '/reports/card-stock', '/reports/readiness'],
      mustNotSee: ['/staff'],
    },
  ];
});

async function phonePage(browser: Browser, width: number) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: TALL } });
  return { context, page: await context.newPage() };
}

async function noSideScroll(page: Page): Promise<number> {
  return page.evaluate(
    `Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth`,
  );
}

async function smallFields(page: Page): Promise<string[]> {
  return page.evaluate(`
    Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((el) => {
        const type = el.getAttribute('type');
        if (['checkbox', 'radio', 'hidden', 'file', 'range', 'color', 'button', 'submit', 'image'].includes(type)) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.tagName.toLowerCase() + (el.getAttribute('name') ? '[' + el.getAttribute('name') + ']' : '') + ' ' + getComputedStyle(el).fontSize)
  `) as Promise<string[]>;
}

test('the viewport allows pinch-zoom and reaches the home-indicator area', async ({ page }) => {
  await page.goto('/login');
  const content = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(content).toContain('viewport-fit=cover');
  expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/);
  expect(content).not.toMatch(/maximum-scale/);
  // The bottom bar pads for the iPhone home indicator.
  const css = await page.evaluate(
    `Array.from(document.styleSheets).map((s) => { try { return Array.from(s.cssRules).map((r) => r.cssText).join('\\n'); } catch { return ''; } }).join('\\n')`,
  );
  expect(css).toContain('safe-area-inset-bottom');
});

test('the login screen has no side scroll and no field under 16px at 320, 390 and 430', async ({ browser }) => {
  for (const width of WIDTHS) {
    const { context, page } = await phonePage(browser, width);
    await page.goto('/login');
    await expect(page.locator('input[name="username"]')).toBeVisible();
    expect(await noSideScroll(page), `side scroll at ${width}px`).toBeLessThanOrEqual(1);
    expect(await smallFields(page), `small fields at ${width}px`).toEqual([]);
    await context.close();
  }
});

test('the change-password screen has no field under 16px and no side scroll', async ({ browser }) => {
  const { context, page } = await phonePage(browser, 390);
  await submitLogin(page, mustChangeUsername, MUST_CHANGE_PASSWORD);
  await expect(page).toHaveURL(/change-password/);
  await expect(page.locator('input[name="currentPassword"]')).toBeVisible();
  expect(await smallFields(page)).toEqual([]);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(1);
  await context.close();
});

test('for every kind of user: one-line equal-width bottom bar, menu = home cards, no failed requests, no side scroll, no field under 16px', async ({
  browser,
}) => {
  test.setTimeout(900_000);
  const failed: string[] = [];

  for (const role of roles) {
    const { context, page } = await phonePage(browser, 390);
    page.on('response', (res) => {
      // Not counted: the refresh probe before a login, and the login throttle
      // (5 a minute), which the login helper retries on purpose.
      const throttledLogin = res.status() === 429 && res.url().includes('/auth/login');
      if (res.status() >= 400 && res.url().includes('/api/v1/') && !res.url().includes('/auth/refresh') && !throttledLogin) {
        failed.push(`${role.key}: ${res.status()} ${res.request().method()} ${res.url().split('/api/v1')[1]}`);
      }
    });
    await loginAs(page, role.username, role.password);

    // ── Bottom bar ────────────────────────────────────────────────────
    const bar = page.locator('nav[aria-label="التنقل السريع"]');
    await expect(bar, `${role.key}: bottom bar`).toBeVisible();
    const items = bar.locator('> a, > button');
    const count = await items.count();
    expect(count, `${role.key}: bar items`).toBeGreaterThanOrEqual(2);
    const widths: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const item = items.nth(i);
      const label = (await item.innerText()).trim();
      expect(label.length, `${role.key}: bar item ${i} has a label`).toBeGreaterThan(0);
      // The visible word is short, but the link keeps its full name for screen
      // readers and voice control, and the visible word is part of that name
      // (a bar link used to be found by tests, and by assistive tech, by its
      // full name, e.g. «تسجيل تعبئة»).
      const fullName = (await item.getAttribute('aria-label')) ?? label;
      expect(fullName, `${role.key}: "${label}" is part of its accessible name`).toContain(label);
      // The label is the first span without the badge's absolute positioning.
      const lines = await item.evaluate((el) => {
        const span = Array.from(el.querySelectorAll('span')).find(
          (s) => (s.textContent ?? '').trim().length > 0 && !s.className.includes('absolute'),
        );
        const range = document.createRange();
        range.selectNodeContents(span as Element);
        return range.getClientRects().length;
      });
      expect(lines, `${role.key}: "${label}" is on one line`).toBe(1);
      widths.push((await item.boundingBox())!.width);
    }
    expect(Math.max(...widths) - Math.min(...widths), `${role.key}: equal widths ${widths.join(',')}`).toBeLessThanOrEqual(1.5);

    // ── Menu sheet and home cards offer the same destinations ─────────
    const cards = await page.locator('main a[href^="/"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('href') as string).filter((href) => href !== '/'),
    );
    await page.getByRole('button', { name: 'القائمة' }).click();
    const sheet = page.locator('div.fixed.inset-0.z-40');
    await expect(sheet).toBeVisible();
    const menu = (
      await sheet.locator('a[href^="/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href') as string))
    ).filter((href) => href !== '/' && href !== '/change-password');
    expect([...new Set(cards)].sort(), `${role.key}: home cards vs phone menu`).toEqual([...new Set(menu)].sort());
    for (const path of role.mustSee) expect(menu, `${role.key} sees ${path}`).toContain(path);
    for (const path of role.mustNotSee) expect(menu, `${role.key} must not see ${path}`).not.toContain(path);
    await sheet.locator('button[aria-label="إغلاق"]').last().click();
    await expect(sheet).toHaveCount(0);

    // ── No side scroll and no small field on every route, at every width ──
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: TALL });
      for (const route of ['/', ...role.routes]) {
        await navigateInApp(page, route);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.waitForTimeout(250);
        expect(await noSideScroll(page), `${role.key}: side scroll on ${route} at ${width}px`).toBeLessThanOrEqual(1);
        if (width === 390) {
          expect(await smallFields(page), `${role.key}: small fields on ${route}`).toEqual([]);
        }
      }
    }
    await context.close();
  }

  expect(failed, 'requests that failed while browsing').toEqual([]);
});

test('the one-time temporary password stays on one line at every phone width', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await phonePage(browser, 390);
  await loginAs(page, fixtures.adminUsername, fixtures.adminPassword);
  await navigateInApp(page, '/admin/users/new');
  await page.getByLabel('الاسم الكامل').fill('موظف الهاتف');
  await page.getByLabel('اسم المستخدم').fill(`pw_phone_${fixtures.runId}`);
  await page.locator('label', { hasText: 'موظف محطة' }).first().click();
  await page.getByRole('searchbox').last().fill(fixtures.stationInternalCode);
  await page.locator('button[aria-pressed]').first().click();
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  const password = page.getByTestId('temporary-password');
  await expect(password).toBeVisible();
  const text = (await password.innerText()).trim();
  expect(text).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);

  for (const width of [320, 360, 390, 430, 600]) {
    await page.setViewportSize({ width, height: TALL });
    const measured = await password.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return {
        lines: range.getClientRects().length,
        fits: el.scrollWidth <= el.clientWidth + 1,
        font: getComputedStyle(el).fontFamily,
      };
    });
    expect(measured.lines, `one line at ${width}px`).toBe(1);
    expect(measured.fits, `inside its box at ${width}px`).toBe(true);
    expect(measured.font.toLowerCase()).toContain('mono');
  }
  await context.close();
});
