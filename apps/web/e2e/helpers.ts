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
  driverId: string;
  driverFullName: string;
  driverIdentityNumber: string;
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

export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page).toHaveURL('/');
}
