import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'http://localhost:3000/api/v1';
const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');
const SEEDED_PASSWORD = 'ChangeMe123!';
const TEMP_PASSWORD = 'PwTemp123!';

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

  // Remove the station scope added to supervisor1 in global-setup.ts, and
  // restore whichever scope(s) it had before this run (as of this phase,
  // that's prisma/seed.ts's own supervisor1 scope — see the comment in
  // global-setup.ts). Without restoring these, every Playwright run would
  // silently undo the seed fixture that DailyReportPage/ViolationsPage
  // depend on for supervisor1 to see any station data at all.
  try {
    // global-setup.ts changes sysadmin1's password to TEMP_PASSWORD when it
    // finds mustChangePassword still set (a genuinely fresh seed) — mirror
    // that here: try the seeded password first (the common case, an
    // already-cleared long-lived dev DB), fall back to TEMP_PASSWORD, and
    // restore to the seeded password/mustChangePassword:true baseline
    // either way, same as supervisor1/admin1 above.
    let sysadminLogin;
    let sysadminPassword = SEEDED_PASSWORD;
    try {
      sysadminLogin = await login('sysadmin1', SEEDED_PASSWORD);
    } catch {
      sysadminLogin = await login('sysadmin1', TEMP_PASSWORD);
      sysadminPassword = TEMP_PASSWORD;
    }
    let sysadminAccessToken = sysadminLogin.accessToken;
    if (sysadminPassword !== SEEDED_PASSWORD) {
      // change-password returns a fresh accessToken directly — reuse it
      // rather than logging in again, same login-budget reasoning as
      // global-setup.ts.
      const changeRes = await axios.post<{ accessToken: string }>(
        `${API_BASE}/auth/change-password`,
        { currentPassword: sysadminPassword, newPassword: SEEDED_PASSWORD },
        { headers: { Authorization: `Bearer ${sysadminAccessToken}` } },
      );
      sysadminAccessToken = changeRes.data.accessToken;
    }
    const sysadminHeaders = { Authorization: `Bearer ${sysadminAccessToken}` };
    await axios.delete(
      `${API_BASE}/users/${fixtures.supervisorUserId}/station-scope/${fixtures.stationId}`,
      { headers: sysadminHeaders },
    );
    for (const stationId of fixtures.originalSupervisorStationIds ?? []) {
      await axios.post(
        `${API_BASE}/users/${fixtures.supervisorUserId}/station-scope`,
        { stationId },
        { headers: sysadminHeaders },
      );
    }
  } catch {
    console.warn('[global-teardown] Failed to restore supervisor1 station scope');
  }
}

export default main;
