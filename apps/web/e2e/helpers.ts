import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Fixtures {
  runId: string;
  stationId: string;
  stationInternalCode: string;
  stationName: string;
  ownerId: string;
  ownerFullName: string;
  ownerIdentityNumber: string;
  vehicleId: string;
  vehicleCurrentPlate: string;
  supervisorUsername: string;
  supervisorPassword: string;
  supervisorUserId: string;
  adminUsername: string;
  adminPassword: string;
  needsChangeUsername: string;
  needsChangePassword: string;
}

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

export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await submitLogin(page, username, password);
  await expect(page).toHaveURL('/');
}
