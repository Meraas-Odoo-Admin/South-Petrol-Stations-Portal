import { test, expect } from '@playwright/test';
import { loadFixtures, submitLogin } from './helpers';

const fixtures = loadFixtures();

// POST /auth/login is throttled to 5/min per app instance — each test in
// this suite logs in exactly once, deliberately, to stay well under that
// budget across the whole run (see global-setup.ts's own note). submitLogin
// retries the whole form submission if that budget is still exceeded
// anyway (e.g. global-setup's own fixture-provisioning logins landed close
// to these), rather than let a 429 look like a broken redirect.

test('login with a seeded user succeeds and lands on the home page', async ({ page }) => {
  await submitLogin(page, fixtures.adminUsername, fixtures.adminPassword);

  await expect(page).toHaveURL('/');
  // Round 16: HomePage's greeting became time-of-day-aware ("صباح
  // الخير"/"مساء الخير" instead of a fixed "مرحبًا،") — matching either
  // form here so this doesn't flake depending on when in the day the
  // suite runs.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/صباح الخير|مساء الخير/);
});

test('a user with mustChangePassword: true is redirected to /change-password and cannot navigate elsewhere until it succeeds', async ({
  page,
}) => {
  await submitLogin(page, fixtures.needsChangeUsername, fixtures.needsChangePassword);

  await expect(page).toHaveURL('/change-password');

  // Direct navigation elsewhere bounces straight back — RequireAuth checks
  // mustChangePassword on every protected route, not just on login.
  await page.goto('/reports/daily');
  await expect(page).toHaveURL('/change-password');
  await page.goto('/');
  await expect(page).toHaveURL('/change-password');

  await page.locator('input[name="currentPassword"]').fill(fixtures.needsChangePassword);
  await page.locator('input[name="newPassword"]').fill('BrandNewPassword123!');
  // confirmPassword is a required field (a later addition to this form,
  // this test just never picked it up) — without it the form's own zod
  // validation blocks submission entirely, which looked identical to a
  // stuck redirect from the outside.
  await page.locator('input[name="confirmPassword"]').fill('BrandNewPassword123!');
  await page.getByRole('button', { name: 'حفظ والمتابعة' }).click();

  // Succeeds and proceeds normally — no forced re-login, per
  // AuthService.changePassword issuing a fresh token pair for this session.
  await expect(page).toHaveURL('/');
});
