import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'http://localhost:3000/api/v1';
const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');
const SEEDED_PASSWORD = 'ChangeMe123!';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same reasoning as global-setup.ts's login(): retry-with-backoff on 429
// specifically, so teardown reliably restores the seeded users even if
// its login calls land close to the tests' own throttle usage.
async function login(username: string, password: string, attempt = 1): Promise<{ accessToken: string }> {
  try {
    const res = await axios.post<{ accessToken: string }>(`${API_BASE}/auth/login`, {
      username,
      password,
    });
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

async function main() {
  if (!existsSync(FIXTURES_PATH)) {
    return;
  }
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

  // Restore supervisor1/admin1 to the seeded baseline (password,
  // mustChangePassword: true) — global-setup.ts only ever intended these
  // as a temporary state for this test run.
  for (const { username, password } of [
    { username: fixtures.supervisorUsername, password: fixtures.supervisorPassword },
    { username: fixtures.adminUsername, password: fixtures.adminPassword },
  ]) {
    try {
      const loginRes = await login(username, password);
      await axios.post(
        `${API_BASE}/auth/change-password`,
        { currentPassword: password, newPassword: SEEDED_PASSWORD },
        { headers: { Authorization: `Bearer ${loginRes.accessToken}` } },
      );
    } catch {
      // Best-effort — a failure here shouldn't fail the whole test run,
      // but is worth surfacing.
      console.warn(`[global-teardown] Failed to restore password for ${username}`);
    }
  }

  // Remove the station scope added to supervisor1 in global-setup.ts.
  try {
    const sysadminLogin = await login('sysadmin1', SEEDED_PASSWORD);
    await axios.delete(
      `${API_BASE}/users/${fixtures.supervisorUserId}/station-scope/${fixtures.stationId}`,
      { headers: { Authorization: `Bearer ${sysadminLogin.accessToken}` } },
    );
  } catch {
    console.warn('[global-teardown] Failed to remove supervisor1 station scope');
  }
}

export default main;
