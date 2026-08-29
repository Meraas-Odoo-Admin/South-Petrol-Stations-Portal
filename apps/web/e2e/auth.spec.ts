import { test, expect } from '@playwright/test';
import { loadFixtures } from './helpers';

const fixtures = loadFixtures();

// POST /auth/login is throttled to 5/min per app instance — each test in
// this suite logs in exactly once, deliberately, to stay well under that
// budget across the whole run (see global-setup.ts's own note).

test('login with a seeded user succeeds and lands on the home page', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(fixtures.adminUsername);
  await page.locator('input[name="password"]').fill(fixtures.adminPassword);
  await page.getByRole('button', { name: 'دخول' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('مرحبًا،');
});

test('a user with mustChangePassword: true is redirected to /change-password and cannot navigate elsewhere until it succeeds', async ({
  page,
}) => {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(fixtures.needsChangeUsername);
  await page.locator('input[name="password"]').fill(fixtures.needsChangePassword);
  await page.getByRole('button', { name: 'دخول' }).click();

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
