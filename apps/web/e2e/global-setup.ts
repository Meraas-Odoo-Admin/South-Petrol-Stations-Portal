import { existsSync, rmSync, writeFileSync } from 'fs';
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { api, API_BASE } from './env';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(__dirname, '.fixtures.json');

// sysadmin1 is the ONE shared seed account this suite touches: the
// fixture-provisioning actor. Its seeded password can be overridden with
// PW_SYSADMIN_PASSWORD if it's been changed on this machine. If it still
// has mustChangePassword (a genuinely fresh seed), it's moved to
// TEMP_PASSWORD for the run and restored in global-teardown.ts.
//
// Registration pivot, phase 2: every account the tests actually log in as
// is created fresh for this run (supervisor, admin, registration employee,
// must-change-password user) — the suite no longer rotates the passwords of
// the shared seed accounts (supervisor1/admin1), which collided with anyone
// using those accounts for manual testing on the same database. There are
// no DELETE endpoints (by design), so these run-specific accounts and
// fixtures stay behind as harmless test data.
const SEEDED_PASSWORD = process.env.PW_SYSADMIN_PASSWORD || 'ChangeMe123!';
const TEMP_PASSWORD = 'PwTemp123!';
const RUN_PASSWORD = 'PwRunUser123!';

export interface Fixtures {
  runId: string;
  stationId: string;
  stationInternalCode: string;
  stationName: string;
  registrationStationId: string;
  registrationStationName: string;
  ownerId: string;
  ownerFullName: string;
  ownerIdentityNumber: string;
  vehicleId: string;
  vehicleCurrentPlate: string;
  // A second registered vehicle with no fill-up history — the clean path.
  cleanVehicleCurrentPlate: string;
  cleanVehicleOwnerFullName: string;
  // Phase 3: a vehicle with an ACTIVE printed card, streamed to the scan
  // test through a fake camera (FAKE_CAMERA_PATH). The first vehicle
  // (vehicleCurrentPlate) has a card too, streamed from FAKE_CAMERA_HISTORY_PATH:
  // it already has a fill-up, so it trips the gap rule.
  scanVehicleCurrentPlate: string;
  scanCardNumber: string;
  // Two more vehicles with ACTIVE cards, for specs that record fill-ups through
  // the API (a fill-up needs a card since Phase 6).
  extraCardNumbers: string[];
  supervisorUsername: string;
  supervisorPassword: string;
  adminUsername: string;
  adminPassword: string;
  registrarUsername: string;
  registrarPassword: string;
  needsChangeUsername: string;
  needsChangePassword: string;
  sysadminPasswordChanged: boolean;
  sysadminPassword: string;
  // Phase 5A: an office manager, and the municipality (سبها) id.
  officeManagerUsername: string;
  officeManagerPassword: string;
  municipalityId: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST /auth/login is throttled to 5/min per app instance — retry-with-
// backoff on 429 specifically (not other errors).
async function login(username: string, password: string, attempt = 1): Promise<{
  accessToken: string;
  mustChangePassword: boolean;
}> {
  try {
    const res = await api.post<{ accessToken: string; mustChangePassword: boolean }>(`${API_BASE}/auth/login`, {
      username,
      password,
    });
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

// Chromium's fake camera (--use-file-for-fake-video-capture) plays a raw
// Y4M video. Build one from the card's own rendered preview: the part of
// the card holding the QR and plate, on white, as grey-scale I420 frames.
export const FAKE_CAMERA_PATH = path.join(__dirname, '.fake-camera.y4m');
export const FAKE_CAMERA_HISTORY_PATH = path.join(__dirname, '.fake-camera-history.y4m');

async function writeFakeCamera(cardPng: Buffer, outPath: string): Promise<void> {
  const width = 640;
  const height = 480;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const luma = (await page.evaluate(
    `(async () => {
      const img = new Image();
      img.src = 'data:image/png;base64,${cardPng.toString('base64')}';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = ${width}; c.height = ${height};
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, ${width}, ${height});
      // The card's QR (left side, about x 194 y 300 in the 1011 x 638 card) is
      // centred in the frame: a tall phone panel crops the frame's sides, so
      // the code has to sit in the middle of it.
      const scale = 0.8;
      x.drawImage(img, ${width} / 2 - 194 * scale, ${height} / 2 - 300 * scale, img.width * scale, img.height * scale);
      const d = x.getImageData(0, 0, ${width}, ${height}).data;
      const y = new Array(${width * height});
      for (let i = 0; i < y.length; i++) y[i] = Math.round(0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2]);
      return y;
    })()`,
  )) as number[];
  await browser.close();
  const yPlane = Buffer.from(luma);
  const chroma = Buffer.alloc((width / 2) * (height / 2), 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), yPlane, chroma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(outPath, Buffer.concat([header, ...Array(10).fill(frame)]));
}

async function main() {
  // A stale file from an earlier run must never be read by a teardown that
  // runs after THIS setup failed part-way.
  if (existsSync(FIXTURES_PATH)) rmSync(FIXTURES_PATH);

  const runId = Date.now().toString(36);
  // Random digits, not a Date.now()-derived value — identityNumber/plate
  // formats are digits-only, and a time-derived value repeats across runs.
  const randomDigits = (n: number) => Math.floor(Math.random() * 10 ** n).toString().padStart(n, '0');
  // Phase 5A: owners are checked with the shared rules - an Arabic name and a
  // national ID with a real birth year (19xx) of an adult. Random Arabic
  // letters, never digits, make each fixture's name unique.
  const ARABIC_LETTERS = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  const arabicTag = (n: number) =>
    Array.from({ length: n }, () => ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)]).join('');
  const nationalId = () => `119${randomDigits(9)}`;
  const chassis = () => {
    const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
    return Array.from({ length: 17 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  };
  const vehicleFields = () => ({
    chassisNumber: chassis(),
    registrationBooklet: randomDigits(8),
    make: 'Toyota',
    model: 'Hilux',
    color: 'ابيض',
    manufactureYear: 2020,
    fuelType: 'PETROL',
    // Required (after review, 19 Oct 2026): set once the types are read below.
    vehicleTypeId: fixtureVehicleTypeId,
  });
  let fixtureVehicleTypeId = '';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const sysadmin = await login('sysadmin1', SEEDED_PASSWORD);
  let sysadminAccessToken = sysadmin.accessToken;
  let sysadminPasswordChanged = false;
  if (sysadmin.mustChangePassword) {
    const changeRes = await api.post<{ accessToken: string }>(
      `${API_BASE}/auth/change-password`,
      { currentPassword: SEEDED_PASSWORD, newPassword: TEMP_PASSWORD },
      { headers: auth(sysadmin.accessToken) },
    );
    sysadminAccessToken = changeRes.data.accessToken;
    sysadminPasswordChanged = true;
  }
  const headers = auth(sysadminAccessToken);

  // Phase 1: fill-ups and registration only happen in a LIVE municipality.
  const municipalities = await api.get<Array<{ id: string; name: string; status: string }>>(
    `${API_BASE}/municipalities`,
    { headers },
  );
  const sabha = municipalities.data.find((m) => m.name === 'سبها' && m.status === 'LIVE');
  if (!sabha) {
    throw new Error('Expected the seeded LIVE municipality سبها — was prisma db seed run?');
  }

  const company = await api.post(`${API_BASE}/companies`, { name: `PW Test Co ${runId}` }, { headers });
  const station = await api.post(
    `${API_BASE}/stations`,
    {
      internalCode: `PW-STN-${runId}`,
      stationNumber: '1',
      name: `PW Test Station ${runId}`,
      companyId: company.data.id,
      municipalityId: sabha.id,
    },
    { headers },
  );
  // Every vehicle needs a type (after review, 19 Oct 2026): the first active one.
  const fixtureTypes = await api.get<Array<{ id: string; isActive: boolean }>>(`${API_BASE}/vehicle-types`, { headers });
  fixtureVehicleTypeId = fixtureTypes.data.find((t) => t.isActive)?.id ?? '';
  if (!fixtureVehicleTypeId) throw new Error('No active vehicle type — was prisma db seed run?');
  const registrationStation = await api.post(
    `${API_BASE}/registration-stations`,
    { name: `PW Registration Desk ${runId}`, municipalityId: sabha.id, address: 'PW test address' },
    { headers },
  );

  // Owners and vehicles are registered AT a registration station (phase 2).
  const registerOwner = async (fullName: string, identityNumber: string) =>
    api.post(
      `${API_BASE}/owners`,
      {
        registrationStationId: registrationStation.data.id,
        identityType: 'NATIONAL_ID',
        identityNumber,
        fullName,
        phone: '0910000000',
      },
      { headers },
    );
  const ownerIdentityNumber = nationalId();
  const owner = await registerOwner(`مالك اختبار ${arabicTag(6)}`, ownerIdentityNumber);
  const vehicle = await api.post(
    `${API_BASE}/vehicles`,
    {
      registrationStationId: registrationStation.data.id,
      internalCode: `PW-VEH-${runId}`,
      currentPlate: `5-${randomDigits(7)}`,
      ownerId: owner.data.id,
      ...vehicleFields(),
    },
    { headers },
  );
  const cleanOwner = await registerOwner(`مالك نظيف ${arabicTag(6)}`, nationalId());
  // City code 9 — the override test types this plate.
  const cleanVehicle = await api.post(
    `${API_BASE}/vehicles`,
    {
      registrationStationId: registrationStation.data.id,
      currentPlate: `9-${randomDigits(7)}`,
      ownerId: cleanOwner.data.id,
      ...vehicleFields(),
    },
    { headers },
  );

  // ── Phase 3: a vehicle with a real printed card (Phase 7: no desk) ──
  const scanOwner = await registerOwner(`مالك مسح ${arabicTag(6)}`, nationalId());
  const scanVehicle = await api.post(
    `${API_BASE}/vehicles`,
    {
      registrationStationId: registrationStation.data.id,
      currentPlate: `6-${randomDigits(7)}`,
      ownerId: scanOwner.data.id,
      ...vehicleFields(),
      make: 'تويوتا',
      model: 'هايلكس',
      color: 'أبيض',
    },
    { headers },
  );
  const scanCard = await api.post<{ id: string; cardNumber: string }>(
    `${API_BASE}/vehicles/${scanVehicle.data.id}/cards`,
    { registrationStationId: registrationStation.data.id, reason: 'FIRST_ISSUE' },
    { headers },
  );
  const preview = await api.get<ArrayBuffer>(`${API_BASE}/cards/${scanCard.data.id}/preview`, {
    headers,
    responseType: 'arraybuffer',
  });
  await writeFakeCamera(Buffer.from(preview.data), FAKE_CAMERA_PATH);

  const extraCardNumbers: string[] = [];
  for (let n = 0; n < 2; n += 1) {
    const extraOwner = await registerOwner(`مالك إضافي ${arabicTag(6)}`, nationalId());
    const extraVehicle = await api.post(
      `${API_BASE}/vehicles`,
      {
        registrationStationId: registrationStation.data.id,
        currentPlate: `4-${randomDigits(7)}`,
        ownerId: extraOwner.data.id,
        ...vehicleFields(),
      },
      { headers },
    );
    const extraCard = await api.post<{ cardNumber: string }>(
      `${API_BASE}/vehicles/${extraVehicle.data.id}/cards`,
      { registrationStationId: registrationStation.data.id, reason: 'FIRST_ISSUE' },
      { headers },
    );
    extraCardNumbers.push(extraCard.data.cardNumber);
  }

  // The first vehicle gets a card too, and a fill-up recorded from it: that
  // history trips the gap rule in the fill-up test and feeds the reports tests.
  const historyCard = await api.post<{ id: string; cardNumber: string }>(
    `${API_BASE}/vehicles/${vehicle.data.id}/cards`,
    { registrationStationId: registrationStation.data.id, reason: 'FIRST_ISSUE' },
    { headers },
  );
  const historyPreview = await api.get<ArrayBuffer>(`${API_BASE}/cards/${historyCard.data.id}/preview`, {
    headers,
    responseType: 'arraybuffer',
  });
  await writeFakeCamera(Buffer.from(historyPreview.data), FAKE_CAMERA_HISTORY_PATH);
  await api.post(
    `${API_BASE}/fillups`,
    { cardNumber: historyCard.data.cardNumber, stationId: station.data.id, fuelType: 'PETROL_95', quantityLiters: 20 },
    { headers: { ...headers, 'Idempotency-Key': `pw-fixture-${runId}` } },
  );

  // ── Run-specific accounts ──────────────────────────────────────────
  const roles = await api.get<Array<{ id: string; name: string }>>(`${API_BASE}/roles`, { headers });
  const roleId = (name: string) => {
    const role = roles.data.find((r) => r.name === name);
    if (!role) throw new Error(`Expected seeded role ${name} — was prisma db seed run?`);
    return role.id;
  };

  const createUser = async (username: string, role: string | null, initialPassword = 'InitialPassword123!') => {
    const user = await api.post<{ id: string }>(
      `${API_BASE}/users`,
      { username, password: initialPassword, fullName: `PW ${username}` },
      { headers },
    );
    if (role) {
      await api.post(`${API_BASE}/users/${user.data.id}/roles`, { roleId: roleId(role) }, { headers });
    }
    return user.data.id;
  };
  // New accounts start with mustChangePassword — clear it by changing to
  // RUN_PASSWORD, so the UI tests aren't blocked by the forced redirect.
  const activate = async (username: string) => {
    const first = await login(username, 'InitialPassword123!');
    await api.post(
      `${API_BASE}/auth/change-password`,
      { currentPassword: 'InitialPassword123!', newPassword: RUN_PASSWORD },
      { headers: auth(first.accessToken) },
    );
  };

  const supervisorUsername = `pw_sup_${runId}`;
  const supervisorId = await createUser(supervisorUsername, 'station_supervisor');
  await api.post(`${API_BASE}/users/${supervisorId}/station-scope`, { stationId: station.data.id }, { headers });

  // Phase 5A: the municipality manager is confined to سبها (job + place in one step).
  const adminUsername = `pw_admin_${runId}`;
  const adminId = await createUser(adminUsername, null);
  await api.put(`${API_BASE}/users/${adminId}/job`, { roleId: roleId('directorate_admin'), placeIds: [sabha.id] }, { headers });

  // The office manager of the fixture registration office.
  const officeManagerUsername = `pw_om_${runId}`;
  const officeManagerId = await createUser(officeManagerUsername, null);
  await api.put(
    `${API_BASE}/users/${officeManagerId}/job`,
    { roleId: roleId('registration_supervisor'), placeIds: [registrationStation.data.id] },
    { headers },
  );

  const registrarUsername = `pw_reg_${runId}`;
  const registrarId = await createUser(registrarUsername, 'registration_employee');
  await api.post(
    `${API_BASE}/users/${registrarId}/registration-station-scope`,
    { registrationStationId: registrationStation.data.id },
    { headers },
  );

  const needsChangeUsername = `pw_needschange_${runId}`;
  await createUser(needsChangeUsername, null);

  await activate(supervisorUsername);
  await activate(adminUsername);
  await activate(registrarUsername);
  await activate(officeManagerUsername);

  // The logins above spend most of the 5/min /auth/login budget. Wait out
  // the window once, so the test phase starts with a clean budget.
  await sleep(61_000);

  const fixtures: Fixtures = {
    runId,
    stationId: station.data.id,
    stationInternalCode: station.data.internalCode,
    stationName: station.data.name,
    registrationStationId: registrationStation.data.id,
    registrationStationName: registrationStation.data.name,
    ownerId: owner.data.id,
    ownerFullName: owner.data.fullName,
    ownerIdentityNumber,
    vehicleId: vehicle.data.id,
    vehicleCurrentPlate: vehicle.data.currentPlate,
    cleanVehicleCurrentPlate: cleanVehicle.data.currentPlate,
    cleanVehicleOwnerFullName: cleanOwner.data.fullName,
    scanVehicleCurrentPlate: scanVehicle.data.currentPlate,
    scanCardNumber: scanCard.data.cardNumber,
    extraCardNumbers,
    supervisorUsername,
    supervisorPassword: RUN_PASSWORD,
    adminUsername,
    adminPassword: RUN_PASSWORD,
    registrarUsername,
    registrarPassword: RUN_PASSWORD,
    needsChangeUsername,
    needsChangePassword: 'InitialPassword123!',
    sysadminPasswordChanged,
    sysadminPassword: sysadminPasswordChanged ? TEMP_PASSWORD : SEEDED_PASSWORD,
    officeManagerUsername,
    officeManagerPassword: RUN_PASSWORD,
    municipalityId: sabha.id,
  };

  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
}

export default main;
