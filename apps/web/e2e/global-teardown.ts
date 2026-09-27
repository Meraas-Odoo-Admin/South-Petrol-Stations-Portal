import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { api, API_BASE } from './env';
import type { Fixtures } from './global-setup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');
const SEEDED_PASSWORD = process.env.PW_SYSADMIN_PASSWORD || 'ChangeMe123!';
const TEMP_PASSWORD = 'PwTemp123!';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(username: string, password: string, attempt = 1): Promise<{ accessToken: string }> {
  try {
    const res = await api.post<{ accessToken: string }>(`${API_BASE}/auth/login`, { username, password });
    return res.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429 && attempt <= 5) {
      console.warn(`[global-teardown] /auth/login throttled for ${username}, retrying in 15s (attempt ${attempt})`);
      await sleep(15_000);
      return login(username, password, attempt + 1);
    }
    throw error;
  }
}

// Registration pivot, phase 2: the tests log in only as accounts created
// for this run (see global-setup.ts), so the only shared state to restore
// is sysadmin1's password — and only if setup had to change it (a fresh
// seed, where it still had mustChangePassword). Restoring it to the seeded
// value via change-password clears mustChangePassword; that's the one
// difference from a fresh seed, and it's harmless for a dev database.
async function main() {
  if (!existsSync(FIXTURES_PATH)) {
    return;
  }
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8')) as Fixtures;
  // Never let a later run's teardown act on this run's leftovers.
  rmSync(FIXTURES_PATH);

  if (!fixtures.sysadminPasswordChanged) {
    return;
  }
  try {
    const sysadmin = await login('sysadmin1', TEMP_PASSWORD);
    await api.post(
      `${API_BASE}/auth/change-password`,
      { currentPassword: TEMP_PASSWORD, newPassword: SEEDED_PASSWORD },
      { headers: { Authorization: `Bearer ${sysadmin.accessToken}` } },
    );
  } catch {
    console.warn('[global-teardown] Failed to restore sysadmin1 to its seeded password');
  }
}

export default main;
