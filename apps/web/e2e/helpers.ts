import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type { Fixtures } from './global-setup';
import type { Fixtures } from './global-setup';

export function loadFixtures(): Fixtures {
  return JSON.parse(readFileSync(path.join(__dirname, '.fixtures.json'), 'utf-8'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /auth/login is throttled to 5/min per app instance — global-setup's
// own fixture provisioning already spends part of that budget before any
// test body gets to log in, so a real 429 landing on a test's own login
// attempt is an expected, not exceptional, occurrence (the node-side
// helpers in global-setup.ts/global-teardown.ts already retry on it for
// the same reason). Unlike those, a page-driven login can't just retry the
// axios call — it has to detect the throttled response and redo the whole
// form submission. Leaves the resulting redirect (to '/' or
// '/change-password' depending on the account) for the caller to assert,
// rather than assuming '/' — see loginAs below for the common case.
export async function submitLogin(page: Page, username: string, password: string, attempt = 1): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);

  const [response] = await Promise.all([
    // Explicit timeout, generous relative to Playwright's 30s default —
    // under real throttling contention (several tests' retries landing
    // close together) the response itself can take a few seconds longer
    // to arrive than usual; the retry loop below is what actually absorbs
    // 429s, this timeout just needs to not fire first on a slow-but-real
    // response.
    page.waitForResponse((res) => res.url().includes('/auth/login'), { timeout: 45_000 }),
    page.getByRole('button', { name: 'دخول' }).click(),
  ]);

  if (response.status() === 429 && attempt <= 5) {
    await sleep(15_000);
    return submitLogin(page, username, password, attempt + 1);
  }
}

// Round 19: OnboardingTour shows itself once per user, tracked in
// localStorage — which starts empty in every fresh Playwright browser
// context, so it appears on literally every test run that logs in via
// loginAs. Left undismissed it sits as a fixed, full-viewport overlay
// that intercepts every subsequent click, which is exactly what broke
// fillups.spec.ts/reports.spec.ts the first time this landed (both went
// straight from login into clicking a nav link/button with no dismiss
// step in between). Dismissing it here, once, keeps every existing spec
// working without each one needing its own awareness of the tour.
async function dismissOnboardingTourIfPresent(page: Page): Promise<void> {
  const tour = page.getByTestId('onboarding-tour');
  const appeared = await tour.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (!appeared) return;
  await page.getByRole('button', { name: 'تخطّي الجولة' }).click();
  await expect(tour).not.toBeVisible();
}

export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await submitLogin(page, username, password);
  await expect(page).toHaveURL('/');
  await dismissOnboardingTourIfPresent(page);
}

// Client-side navigation to a route with no link on the current screen.
// page.goto() is a real browser load: it remounts the app and re-runs
// AuthProvider's silent /auth/refresh, which is throttled (10/min) with no
// retry-on-429 — enough full reloads in one run and a later test gets
// bounced to /login. pushState + popstate is what react-router listens to,
// so this changes route without reloading the page.
export async function navigateInApp(page: Page, path: string): Promise<void> {
  // A string, not a function: e2e/tsconfig.json has no DOM lib.
  await page.evaluate(
    `window.history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate'));`,
  );
  await expect(page).toHaveURL(path);
}
