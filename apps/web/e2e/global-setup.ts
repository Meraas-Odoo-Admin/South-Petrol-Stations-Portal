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
// so the company/station/owner/vehicle/fill-up/throwaway-user fixtures
// created below are NOT cleaned up; they're harmless leftover test data,
// same as every backend e2e spec's fixtures that predate a delete path.
const TEMP_PASSWORD = 'PwTemp123!';
const SEEDED_PASSWORD = 'ChangeMe123!';

interface Fixtures {
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
  originalSupervisorStationIds: string[];
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
  // This phase added class-validator format enforcement for
  // identityNumber/currentPlate (see
  // apps/api/src/common/validators/libyan-formats.ts) — runId's base36
  // alphabet can contain letters, which no longer passes, so fixtures that
  // need to look like real Libyan documents use random digit strings
  // instead. Station/company/vehicle internalCode fields have no format
  // constraint, so they keep using the original alphanumeric runId.
  // RANDOM, not a Date.now()-derived modulo — a `Date.now() % 1_000_000`
  // version of this genuinely collided with a leftover row from an
  // earlier run within one dev session (it repeats every ~16.7 minutes;
  // there are no DELETE endpoints, so old fixture rows never go away).
  const randomDigits = (n: number) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
  const numericId11 = randomDigits(11); // fills identityNumber's 11 digits after the type prefix
  const plateSeq = randomDigits(7);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // sysadmin1 has every permission and unrestrictedStationAccess — used
  // purely as the fixture-provisioning actor, never logged into by the
  // actual tests. On a genuinely fresh seed (mustChangePassword: true,
  // the actual seeded default — this only went unnoticed before because a
  // long-lived dev DB usually already has it cleared from a prior run)
  // every API call below would 403 under the server-side mustChangePassword
  // gate, since sysadmin1's own token is used for all of this script's
  // fixture-provisioning calls. Same TEMP_PASSWORD/restore pattern as
  // supervisor1/admin1 below, just done first since sysadmin1's own token
  // is needed immediately after login.
  const sysadmin = await login('sysadmin1', SEEDED_PASSWORD);
  let sysadminAccessToken = sysadmin.accessToken;
  if (sysadmin.mustChangePassword) {
    // change-password returns a fresh accessToken directly (see
    // AuthController.changePassword) — reuse it instead of logging in
    // again, since /auth/login is throttled to 5/min and this script
    // already spends several of that budget's slots before the actual
    // test bodies get to log in at all.
    const changeRes = await axios.post<{ accessToken: string }>(
      `${API_BASE}/auth/change-password`,
      { currentPassword: SEEDED_PASSWORD, newPassword: TEMP_PASSWORD },
      { headers: auth(sysadmin.accessToken) },
    );
    sysadminAccessToken = changeRes.data.accessToken;
  }
  const sysadminHeaders = auth(sysadminAccessToken);

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

  const ownerIdentityNumber = `1${numericId11}`;
  const owner = await axios.post(
    `${API_BASE}/owners`,
    {
      identityType: 'NATIONAL_ID',
      identityNumber: ownerIdentityNumber,
      fullName: `PW Test Owner ${runId}`,
    },
    { headers: sysadminHeaders },
  );

  const vehicle = await axios.post(
    `${API_BASE}/vehicles`,
    { internalCode: `PW-VEH-${runId}`, currentPlate: `5-${plateSeq}`, ownerId: owner.data.id },
    { headers: sysadminHeaders },
  );

  // Fill-up history at this station, for the vehicle-detail-page test.
  await axios.post(
    `${API_BASE}/fillups`,
    {
      vehicleId: vehicle.data.id,
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

  // Clear supervisor1's station scope(s) so this run starts from exactly
  // one (the fixture station below) — DailyReportPage renders
  // user.stationScope[0], so more than one scope makes the test assert
  // against the WRONG station and fail confusingly. This now legitimately
  // includes prisma/seed.ts's own scope (supervisor1 is seeded with a
  // station scope as of this phase — see seed.ts), not just leftovers from
  // a crashed prior run, so the cleared scopes are snapshotted here and
  // restored in global-teardown.ts rather than discarded — otherwise every
  // Playwright run would silently undo the seed fixture.
  const supervisorDetail = await axios.get<{
    stationScope: Array<{ stationId: string }>;
  }>(`${API_BASE}/users/${supervisorUser.id}`, { headers: sysadminHeaders });
  const originalSupervisorStationIds = supervisorDetail.data.stationScope.map((s) => s.stationId);
  for (const stationId of originalSupervisorStationIds) {
    await axios.delete(`${API_BASE}/users/${supervisorUser.id}/station-scope/${stationId}`, {
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
    ownerId: owner.data.id,
    ownerFullName: owner.data.fullName,
    ownerIdentityNumber,
    vehicleId: vehicle.data.id,
    vehicleCurrentPlate: vehicle.data.currentPlate,
    supervisorUsername: 'supervisor1',
    supervisorPassword: TEMP_PASSWORD,
    supervisorUserId: supervisorUser.id,
    originalSupervisorStationIds,
    adminUsername: 'admin1',
    adminPassword: TEMP_PASSWORD,
    needsChangeUsername,
    needsChangePassword,
  };

  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
}

export default main;
