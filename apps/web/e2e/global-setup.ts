import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'http://localhost:3000/api/v1';
const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');

// Temporary passwords used ONLY for the duration of this test run — global
// teardown rotates supervisor1/admin1 back to their seeded baseline
// ('ChangeMe123!', mustChangePassword: true) so this suite leaves no
// lasting change to the shared dev-seed users. There are no DELETE
// endpoints anywhere in this codebase (by design — see CLAUDE.md/M1-M4),
// so the company/station/driver/vehicle/fill-up/throwaway-user fixtures
// created below are NOT cleaned up; they're harmless leftover test data,
// same as every backend e2e spec's fixtures that predate a delete path.
const TEMP_PASSWORD = 'PwTemp123!';
const SEEDED_PASSWORD = 'ChangeMe123!';

interface Fixtures {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /auth/login is throttled to 5/min per app instance. Fixture setup
// alone makes 3 real login calls; retry-with-backoff on 429 specifically
// (not other errors) makes this robust to whatever else shares that
// budget — e.g. a prior run's leftover window, or this script re-running
// during manual debugging — rather than only ever working when timed just
// right.
async function login(username: string, password: string, attempt = 1): Promise<{
  accessToken: string;
  mustChangePassword: boolean;
}> {
  try {
    const res = await axios.post<{ accessToken: string; mustChangePassword: boolean }>(
      `${API_BASE}/auth/login`,
      { username, password },
    );
    return res.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429 && attempt <= 5) {
      console.warn(`[global-setup] /auth/login throttled for ${username}, retrying in 15s (attempt ${attempt})`);
      await sleep(15_000);
      return login(username, password, attempt + 1);
    }
    throw error;
  }
}

async function main() {
  const runId = Date.now().toString(36);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // sysadmin1 has every permission and unrestrictedStationAccess — used
  // purely as the fixture-provisioning actor, never logged into by the
  // actual tests.
  const sysadmin = await login('sysadmin1', SEEDED_PASSWORD);
  const sysadminHeaders = auth(sysadmin.accessToken);

  const company = await axios.post(
    `${API_BASE}/companies`,
    { name: `PW Test Co ${runId}` },
    { headers: sysadminHeaders },
  );

  const station = await axios.post(
    `${API_BASE}/stations`,
    {
      internalCode: `PW-STN-${runId}`,
      stationNumber: '1',
      name: `PW Test Station ${runId}`,
      companyId: company.data.id,
    },
    { headers: sysadminHeaders },
  );

  const driverIdentityNumber = `119${runId}2345`;
  const driver = await axios.post(
    `${API_BASE}/drivers`,
    {
      identityType: 'NATIONAL_ID',
      identityNumber: driverIdentityNumber,
      fullName: `PW Test Driver ${runId}`,
    },
    { headers: sysadminHeaders },
  );

  const vehicle = await axios.post(
    `${API_BASE}/vehicles`,
    { internalCode: `PW-VEH-${runId}`, currentPlate: `PW-PLATE-${runId}` },
    { headers: sysadminHeaders },
  );

  // Fill-up history at this station, for the driver-detail-page test.
  await axios.post(
    `${API_BASE}/fillups`,
    {
      vehicleId: vehicle.data.id,
      driverId: driver.data.id,
      stationId: station.data.id,
      fuelType: 'PETROL_95',
      quantityLiters: 20,
    },
    { headers: { ...sysadminHeaders, 'Idempotency-Key': `pw-fixture-${runId}` } },
  );

  // Scope the SEEDED supervisor1 to this station (station_supervisor
  // already holds reports:view from seed.ts — no role assignment needed,
  // avoiding the need to look up a Role id, which no GET /roles endpoint
  // exposes anywhere in this API).
  const users = await axios.get<Array<{ id: string; username: string }>>(`${API_BASE}/users`, {
    headers: sysadminHeaders,
  });
  const supervisorUser = users.data.find((u) => u.username === 'supervisor1');
  const adminUser = users.data.find((u) => u.username === 'admin1');
  if (!supervisorUser || !adminUser) {
    throw new Error('Expected seeded users supervisor1/admin1 not found — was prisma db seed run?');
  }

  // Clear any station scopes left over from a PRIOR run of this suite —
  // e.g. one where global-teardown didn't get a chance to remove them
  // (crashed, or hit an unretried 429 before retry-with-backoff was
  // added). DailyReportPage renders user.stationScope[0], so a stale
  // extra scope from an old run makes the test assert against the WRONG
  // station and fail confusingly. Always start this run from zero.
  const supervisorDetail = await axios.get<{
    stationScope: Array<{ stationId: string }>;
  }>(`${API_BASE}/users/${supervisorUser.id}`, { headers: sysadminHeaders });
  for (const scope of supervisorDetail.data.stationScope) {
    await axios.delete(`${API_BASE}/users/${supervisorUser.id}/station-scope/${scope.stationId}`, {
      headers: sysadminHeaders,
    });
  }

  await axios.post(
    `${API_BASE}/users/${supervisorUser.id}/station-scope`,
    { stationId: station.data.id },
    { headers: sysadminHeaders },
  );

  // Clear mustChangePassword on both seeded users so the actual UI tests
  // (nav-by-role, masking) aren't blocked by the forced-change redirect —
  // restored to the original seeded password in global-teardown.ts.
  const supervisorLogin = await login('supervisor1', SEEDED_PASSWORD);
  await axios.post(
    `${API_BASE}/auth/change-password`,
    { currentPassword: SEEDED_PASSWORD, newPassword: TEMP_PASSWORD },
    { headers: auth(supervisorLogin.accessToken) },
  );

  const adminLogin = await login('admin1', SEEDED_PASSWORD);
  await axios.post(
    `${API_BASE}/auth/change-password`,
    { currentPassword: SEEDED_PASSWORD, newPassword: TEMP_PASSWORD },
    { headers: auth(adminLogin.accessToken) },
  );

  // A dedicated throwaway user, deliberately left with
  // mustChangePassword: true — this is what the redirect-and-block test
  // exercises. No role needed; that test never touches permission-gated
  // content.
  const needsChangeUsername = `pw_needschange_${runId}`;
  const needsChangePassword = 'InitialPassword123!';
  await axios.post(
    `${API_BASE}/users`,
    { username: needsChangeUsername, password: needsChangePassword, fullName: 'PW Needs Change' },
    { headers: sysadminHeaders },
  );

  // POST /auth/login is throttled to 5/min PER APP INSTANCE (not per
  // username) — the 3 real logins just above (sysadmin1, supervisor1,
  // admin1) already spend more than half that budget. Without this pause,
  // the actual tests' own logins land in the same rolling window and get
  // 429'd, which manifests as "stuck on /login" — genuinely confusing to
  // debug from a UI-level failure. Wait out the window here, once, so the
  // test phase starts with a clean budget.
  await new Promise((resolve) => setTimeout(resolve, 61_000));

  const fixtures: Fixtures = {
    runId,
    stationId: station.data.id,
    stationInternalCode: station.data.internalCode,
    stationName: station.data.name,
    driverId: driver.data.id,
    driverFullName: driver.data.fullName,
    driverIdentityNumber,
    supervisorUsername: 'supervisor1',
    supervisorPassword: TEMP_PASSWORD,
    supervisorUserId: supervisorUser.id,
    adminUsername: 'admin1',
    adminPassword: TEMP_PASSWORD,
    needsChangeUsername,
    needsChangePassword,
  };

  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
}

export default main;
