import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
// Round 20: split out to rbac-catalog.ts (a side-effect-free module) so
// bootstrap-prod.ts can reuse this exact catalog without importing this
// file itself, which would also run this file's own `main()` (below,
// unconditional at module load) and seed demo data as a side effect.
import { PERMISSIONS, ROLE_PERMISSIONS, UNRESTRICTED_STATION_ACCESS_ROLES, SYSTEM_SETTINGS } from './rbac-catalog';

export { PERMISSIONS, ROLE_PERMISSIONS, UNRESTRICTED_STATION_ACCESS_ROLES, SYSTEM_SETTINGS };

const prisma = new PrismaClient();

// docs/OPEN_ITEMS.md #1/#2 RESOLVED (round 17): the client provided the
// real station rosters for all six companies below (see REAL_STATIONS) —
// نفط ليبيا and الطرق السريعة are confirmed as two SEPARATE companies with
// their own distinct station lists (resolving #2's "split into two"
// question), and the 27-row "مكاتب مبيعات الجنوبية" list is attributed to
// الراحلة per the client's own filename for that roster (resolving #1).
const COMPANIES = [
  'ليبيا نفط',
  'الراحلة',
  'الشرارة الذهبية',
  'الطرق السريعة',
  'الثقة الدولية',
  'البريقة',
];

// station-card-field-spec item 4/5 — real municipality/sub-locality names
// from the client's own station rosters (docs/OPEN_ITEMS.md #1/#2/#3,
// round 17), not a placeholder list. Kept at the granularity the source
// documents themselves used (a specific town within a municipality is its
// own row here, same as تجريف/الرقيبة/زاوية مرزق already were before this
// round) rather than guessing at Libya's formal administrative boundaries.
const MUNICIPALITIES = [
  'سبها',
  'الشاطئ',
  'مرزق',
  'تراغن',
  'غات',
  'المطرود',
  'الرقيبة',
  'تكركيبة',
  'اشكدة',
  'غدوة',
  'سمنو',
  'القطرون',
  'براك',
  'قيرة',
  'تامزاوة',
  'ثاروت',
  'بنت بيه',
  'القرايا',
  'الغريفة',
  'العوينات',
  'البركت',
  'جيزاو',
  'زويلة',
  'السبيطات',
  'تمنهنت',
  'الزيغن',
  'الشويرف',
  'أوباري',
  'المجدول',
  'تساوة',
  'قراقرة',
  'بردي',
  'ونزريك',
  'تمسة',
  'قبرعون',
  'اخليف',
  'الزهراء',
  'القرضة',
  'حجارة',
  'المثلث',
  'الزوية',
  'أم الأرانب',
  'الشرقية',
  'تهالة',
  'فنقل',
  'مكنوسة',
  'جرمة',
  'الأبيض',
  'البدير',
];
const ROUTES = ['خط سبها', 'خط الشاطئ', 'خط مرزق', 'خط اوباري', 'خط البارك'];
// One security authority per municipality (docs/OPEN_ITEMS.md #4, answered).
const SECURITY_AUTHORITIES = [{ name: 'مديرية أمن سبها', municipality: 'سبها' }];

// Registration pivot, phase 1: only سبها is live. Every other seeded
// municipality stays PREPARING (the schema default) — its stations are
// admin-only and take no fill-ups. Removing the non-Sabha rows is a later
// phase, waiting on the client's list of which names fall inside Sabha.
const LIVE_MUNICIPALITIES = new Set(['سبها']);

// Round 12: starting list for the new VehicleType lookup — admin/
// system_admin can add more from the admin panel, this just keeps the
// dropdown non-empty on first login.
const VEHICLE_TYPES = ['سيارة خاصة', 'نقل خفيف', 'نقل ثقيل', 'حافلة', 'دراجة نارية', 'معدة ثقيلة'];

// ── Drivers, Owners, Vehicles: seeded test fixtures ───────────────────
// Prior to this phase, seed.ts created ONLY companies/roles/stations/test
// users — a fresh reseed produced zero drivers/vehicles/owners, so there
// was nothing to actually record a fill-up against or browse. Still
// synthetic (not real client data — same caveat as the station list), but
// valid-format per the regex rules in
// apps/api/src/common/validators/libyan-formats.ts, and deliberately
// varied to exercise every path that has no create/edit UI yet to
// generate its own fixtures from: multi-entry plate history, a
// multi-driver association with exactly one primary, and both a
// with-history and a clean (zero-fill-up) vehicle/driver.
//
// Round 18: `Vehicle.model` is a single free-text field, and
// `VehicleBrandPicker`/`VehicleBrandLogo` treat it as the BRAND alone
// (exact-matched against `VEHICLE_BRANDS[].name`, which are English brand
// names like "Toyota") — there is no separate "specific model/trim"
// column in the schema. Every `model` value below was changed from an
// earlier round's Arabic "brand + trim" compound string (e.g. "تويوتا
// لاندكروزر") to the bare English brand name the real dropdown actually
// offers (e.g. "Toyota") — otherwise VehicleBrandLogo's exact-match never
// hits and every seeded vehicle silently falls back to the generic
// category glyph, exactly the gap the client asked to have fixed. This
// does lose the trim-level flavor (Land Cruiser vs. Hilux); adding that
// back would need a real schema column, not a seed-data change.
const SEED_OWNERS = [
  { key: 'O1', identityType: 'NATIONAL_ID', identityNumber: '119700000011', fullName: 'عبدالسلام محمد الزنتاني', phone: '091-1000011' },
  { key: 'O2', identityType: 'NATIONAL_ID', identityNumber: '219750000012', fullName: 'فاطمة علي المصراتي', phone: '092-1000012' },
  // Round 17: additional owners named for the actual region the newly-
  // seeded real stations sit in (Fezzan — سبها/أوباري/مرزق/القطرون/غات),
  // drawing on the tribal/nisba surnames genuinely common there rather
  // than reusing the same two coastal-city names for every fixture.
  { key: 'O3', identityType: 'NATIONAL_ID', identityNumber: '219680000013', fullName: 'عائشة سالم أولاد سليمان', phone: '091-3450013' },
  { key: 'O4', identityType: 'NATIONAL_ID', identityNumber: '118750000014', fullName: 'إبراهيم مفتاح المقرحي', phone: '092-5670014' },
  { key: 'O5', identityType: 'NATIONAL_ID', identityNumber: '219820000015', fullName: 'نورية خليفة التارقي', phone: '092-7890015' },
  { key: 'O6', identityType: 'NATIONAL_ID', identityNumber: '118900000016', fullName: 'مادي كوكو غبدي', phone: '091-4560016' },
  { key: 'O7', identityType: 'NATIONAL_ID', identityNumber: '117650000017', fullName: 'الصادق عمر الحساوي', phone: '092-3780017' },
  { key: 'O8', identityType: 'NATIONAL_ID', identityNumber: '219770000018', fullName: 'زينب محمد الرقيعي', phone: '091-2340018' },
  { key: 'O9', identityType: 'NATIONAL_ID', identityNumber: '118600000019', fullName: 'مفتاح سالم القذاذفة', phone: '092-6450019' },
  { key: 'O10', identityType: 'NATIONAL_ID', identityNumber: '219850000020', fullName: 'حواء إبراهيم أنت عمر', phone: '091-3670020' },
  { key: 'O11', identityType: 'ADMINISTRATIVE_ID', identityNumber: '918700000021', fullName: 'عبدالناصر خليفة الفزاني', phone: '092-5890021' },
  { key: 'O12', identityType: 'NATIONAL_ID', identityNumber: '219730000022', fullName: 'سعاد علي المجابرة', phone: '091-4230022' },
] as const;

const SEED_DRIVERS = [
  { key: 'D1', identityType: 'NATIONAL_ID', identityNumber: '119850000001', fullName: 'محمد عبدالسلام الزنتاني', phone: '091-2000001' },
  { key: 'D2', identityType: 'NATIONAL_ID', identityNumber: '219900000002', fullName: 'خديجة إبراهيم المصراتي', phone: '092-2000002' },
  { key: 'D3', identityType: 'NATIONAL_ID', identityNumber: '117800000003', fullName: 'عمر يوسف الفزاني', phone: '093-2000003' },
  { key: 'D4', identityType: 'ADMINISTRATIVE_ID', identityNumber: '919950000004', fullName: 'يوسف الطاهر الطارقي', phone: '094-2000004' },
  { key: 'D5', identityType: 'NATIONAL_ID', identityNumber: '118200000005', fullName: 'سالم أحمد البرعصي', phone: '095-2000005' },
  { key: 'D6', identityType: 'NATIONAL_ID', identityNumber: '218800000006', fullName: 'مريم خالد الشريف', phone: '096-2000006' },
] as const;

// stationKey 'A' = STN-TEST-0001 (Raheela), 'B' = STN-TEST-0002 (Sharara) —
// resolved against stationA/stationB further down, once they exist.
const SEED_VEHICLES = [
  {
    key: 'V1',
    internalCode: 'VEH-SEED-001',
    currentPlate: '5-1000002',
    chassisNumber: 'SEEDV000000000001',
    vehicleType: 'سيارة خاصة',
    model: 'Toyota',
    color: 'أبيض',
    manufactureYear: 2019,
    usageType: 'PRIVATE',
    ownerKey: 'O1',
    // 2 rows: an older, closed plate, then the current one — exercises the
    // plate-history UI path, which has no create/edit form to generate
    // this from otherwise.
    plateHistory: ['5-1000001', '5-1000002'],
    // 2 drivers, exactly one primary — same reasoning, no association UI
    // exists yet either.
    drivers: [
      { key: 'D1', isPrimary: true },
      { key: 'D2', isPrimary: false },
    ],
    // Recent (yesterday) — a fresh test fill-up against V1 today should
    // trip VEHICLE_GAP_TOO_SHORT, so the rule-violation/exception flow is
    // actually reachable without the tester needing to record two fill-ups
    // themselves first.
    fillUps: [{ daysAgo: 1, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 35 }],
  },
  {
    key: 'V2',
    internalCode: 'VEH-SEED-002',
    currentPlate: '8-2000001',
    chassisNumber: 'SEEDV000000000002',
    vehicleType: 'سيارة خاصة',
    model: 'Kia',
    color: 'رمادي',
    manufactureYear: 2021,
    usageType: 'PRIVATE',
    ownerKey: 'O2',
    drivers: [{ key: 'D3', isPrimary: true }],
    // Three fill-ups already inside the current rolling 7-day window,
    // spaced exactly min_gap_days apart from each other and from "now" —
    // the rule engine's weekly-cap check trips only once the EXISTING
    // count already reaches fillup.max_per_week (3), so a fresh test
    // fill-up (which would be the 4th) passes the gap check but hits
    // VEHICLE_WEEKLY_CAP_REACHED. Otherwise testing the weekly cap means
    // waiting a real week. V3/V5/V6 stay at zero fill-ups for the "first
    // fill-up ever" / clean path.
    fillUps: [
      { daysAgo: 6, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 30 },
      { daysAgo: 4, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 28 },
      { daysAgo: 2, stationKey: 'A', fuelType: 'PETROL_95', quantityLiters: 32 },
    ],
  },
  {
    key: 'V3',
    internalCode: 'VEH-SEED-003',
    currentPlate: '15-3000001',
    chassisNumber: 'SEEDV000000000003',
    vehicleType: 'نقل خفيف',
    model: 'Toyota',
    color: 'أزرق',
    manufactureYear: 2017,
    usageType: 'COMMERCIAL',
    ownerKey: null,
    drivers: [{ key: 'D4', isPrimary: true }],
    fillUps: [],
  },
  {
    key: 'V4',
    internalCode: 'VEH-SEED-004',
    currentPlate: '5-4000001',
    chassisNumber: 'SEEDV000000000004',
    vehicleType: 'سيارة خاصة',
    model: 'Hyundai',
    color: 'أسود',
    manufactureYear: 2020,
    usageType: 'PRIVATE',
    ownerKey: 'O1',
    drivers: [{ key: 'D5', isPrimary: true }],
    // Old enough (5 days, past the 2-day gap) to be browsable history
    // without blocking a fresh test fill-up against the same vehicle.
    fillUps: [{ daysAgo: 5, stationKey: 'B', fuelType: 'DIESEL', quantityLiters: 50 }],
  },
  {
    key: 'V5',
    internalCode: 'VEH-SEED-005',
    currentPlate: '8-5000001',
    chassisNumber: null, // deliberately unset — exercises the change-request first-time-set path
    vehicleType: 'سيارة خاصة',
    model: 'Toyota',
    color: 'أبيض',
    manufactureYear: 2022,
    usageType: 'GOVERNMENT',
    ownerKey: null,
    drivers: [], // no driver assigned at all — a real, if unusual, state
    fillUps: [],
  },
  {
    key: 'V6',
    internalCode: 'VEH-SEED-006',
    currentPlate: '15-6000001',
    chassisNumber: 'SEEDV000000000006',
    vehicleType: 'سيارة خاصة',
    model: 'Nissan',
    color: 'فضي',
    manufactureYear: 2018,
    usageType: 'PRIVATE',
    ownerKey: 'O2',
    drivers: [{ key: 'D6', isPrimary: true }],
    fillUps: [],
  },
  // Round 17: additional vehicles recording fill-up history at the newly-
  // seeded real stations (see stationsByKey below) instead of only the
  // two synthetic ones — no driver association on any of these (round 6
  // dropped driver identity from the active fill-up flow; Driver/
  // DriverVehicle are kept only for historical rows the original 6
  // vehicles already exercise).
  {
    key: 'V7',
    internalCode: 'VEH-SEED-007',
    currentPlate: '21-1234567',
    chassisNumber: 'SEEDV000000000007',
    vehicleType: 'نقل خفيف',
    model: 'Toyota',
    color: 'أبيض',
    manufactureYear: 2020,
    usageType: 'PRIVATE',
    ownerKey: 'O3',
    drivers: [],
    fillUps: [{ daysAgo: 6, stationKey: 'THIQA', fuelType: 'PETROL_95', quantityLiters: 40 }],
  },
  {
    key: 'V8',
    internalCode: 'VEH-SEED-008',
    currentPlate: '5-987654',
    chassisNumber: 'SEEDV000000000008',
    vehicleType: 'سيارة خاصة',
    model: 'Hyundai',
    color: 'فضي',
    manufactureYear: 2022,
    usageType: 'PRIVATE',
    ownerKey: 'O4',
    drivers: [],
    fillUps: [{ daysAgo: 3, stationKey: 'RAWWAD', fuelType: 'PETROL_95', quantityLiters: 38 }],
  },
  {
    key: 'V9',
    internalCode: 'VEH-SEED-009',
    currentPlate: '9-456123',
    chassisNumber: 'SEEDV000000000009',
    vehicleType: 'سيارة خاصة',
    model: 'Kia',
    color: 'أسود',
    manufactureYear: 2021,
    usageType: 'PRIVATE',
    ownerKey: 'O5',
    drivers: [],
    fillUps: [],
  },
  {
    key: 'V10',
    internalCode: 'VEH-SEED-010',
    currentPlate: '31-778899',
    chassisNumber: 'SEEDV000000000010',
    vehicleType: 'سيارة خاصة',
    model: 'Nissan',
    color: 'أبيض',
    manufactureYear: 2019,
    usageType: 'PRIVATE',
    ownerKey: 'O6',
    drivers: [],
    fillUps: [{ daysAgo: 8, stationKey: 'MURZUQ', fuelType: 'PETROL_95', quantityLiters: 45 }],
  },
  {
    key: 'V11',
    internalCode: 'VEH-SEED-011',
    currentPlate: '5-334455',
    chassisNumber: 'SEEDV000000000011',
    vehicleType: 'سيارة خاصة',
    model: 'Toyota',
    color: 'رمادي',
    manufactureYear: 2023,
    usageType: 'GOVERNMENT',
    ownerKey: 'O7',
    drivers: [],
    fillUps: [
      { daysAgo: 10, stationKey: 'KATIB', fuelType: 'PETROL_95', quantityLiters: 42 },
      { daysAgo: 5, stationKey: 'KATIB', fuelType: 'PETROL_95', quantityLiters: 40 },
    ],
  },
  {
    key: 'V12',
    internalCode: 'VEH-SEED-012',
    currentPlate: '8-112233',
    chassisNumber: 'SEEDV000000000012',
    vehicleType: 'سيارة خاصة',
    model: 'Mercedes-Benz',
    color: 'أسود',
    manufactureYear: 2018,
    usageType: 'PRIVATE',
    ownerKey: 'O8',
    drivers: [],
    fillUps: [],
  },
  {
    key: 'V13',
    internalCode: 'VEH-SEED-013',
    currentPlate: '15-665544',
    chassisNumber: 'SEEDV000000000013',
    vehicleType: 'سيارة خاصة',
    model: 'Suzuki',
    color: 'أزرق',
    manufactureYear: 2020,
    usageType: 'PRIVATE',
    ownerKey: 'O9',
    drivers: [],
    fillUps: [{ daysAgo: 4, stationKey: 'AFIYA', fuelType: 'PETROL_95', quantityLiters: 36 }],
  },
  {
    key: 'V14',
    internalCode: 'VEH-SEED-014',
    currentPlate: '21-998877',
    chassisNumber: 'SEEDV000000000014',
    vehicleType: 'نقل ثقيل',
    model: 'Isuzu',
    color: 'أبيض',
    manufactureYear: 2017,
    usageType: 'COMMERCIAL',
    ownerKey: 'O10',
    drivers: [],
    fillUps: [{ daysAgo: 7, stationKey: 'NAMAA', fuelType: 'DIESEL', quantityLiters: 60 }],
  },
  {
    key: 'V15',
    internalCode: 'VEH-SEED-015',
    currentPlate: '9-223344',
    chassisNumber: 'SEEDV000000000015',
    vehicleType: 'سيارة خاصة',
    model: 'Peugeot',
    color: 'فضي',
    manufactureYear: 2021,
    usageType: 'PRIVATE',
    ownerKey: 'O11',
    drivers: [],
    fillUps: [],
  },
  {
    key: 'V16',
    internalCode: 'VEH-SEED-016',
    currentPlate: '5-556677',
    chassisNumber: 'SEEDV000000000016',
    vehicleType: 'سيارة خاصة',
    model: 'Kia',
    color: 'أحمر',
    manufactureYear: 2019,
    usageType: 'PRIVATE',
    ownerKey: 'O12',
    drivers: [],
    fillUps: [{ daysAgo: 6, stationKey: 'B', fuelType: 'PETROL_95', quantityLiters: 25 }],
  },
  {
    key: 'V17',
    internalCode: 'VEH-SEED-017',
    currentPlate: '31-889900',
    chassisNumber: 'SEEDV000000000017',
    vehicleType: 'سيارة خاصة',
    model: 'Mitsubishi',
    color: 'أسود',
    manufactureYear: 2016,
    usageType: 'PRIVATE',
    // Same owner as V7 — a real, common case (one owner, multiple
    // vehicles), which is exactly what the per-owner aggregate rule-engine
    // checks (docs/DESIGN_owner_based_fillups.md) exist to catch.
    ownerKey: 'O3',
    drivers: [],
    fillUps: [{ daysAgo: 2, stationKey: 'MURZUQ', fuelType: 'PETROL_95', quantityLiters: 44 }],
  },
  {
    key: 'V18',
    internalCode: 'VEH-SEED-018',
    currentPlate: '5-778899',
    chassisNumber: 'SEEDV000000000018',
    vehicleType: 'سيارة خاصة',
    model: 'Hyundai',
    color: 'أبيض',
    manufactureYear: 2022,
    usageType: 'PRIVATE',
    ownerKey: null,
    drivers: [],
    fillUps: [],
  },
] as const;

// Synthetic placeholders so the exception approve flow has something to
// test against — NOT the client-confirmed categories from docs/OPEN_ITEMS.md
// #12/#13 (transit-traveler, medical), which are still pending.
const EXCEPTION_TYPES = [
  {
    key: 'OTHER',
    name: 'Other (synthetic placeholder — not a real client-confirmed category)',
    requiresProof: true,
  },
  {
    key: 'OTHER_NO_PROOF',
    name: 'Other, no proof required (synthetic placeholder — not a real client-confirmed category)',
    requiresProof: false,
  },
];

// ── Real station rosters (round 17, docs/OPEN_ITEMS.md #1/#2/#3/#10) ──
// Transcribed directly from the client's own documents: محطات.txt
// (البريقة + الثقة الدولية), and three photographed company rosters —
// "كشف محطات شركة نفط ليبيا في نطاق المنطقة الجنوبية.jpeg", "شركة الطرق
// السريعة في نطاق بلديات الجنوب.jpeg", "شركة الراحلة في نطاق الجنوبية.jpeg"
// (headed "بيانات التفصيلية للمحطات الوقود التابعة لمكتب مبيعات المنطقة
// الجنوبية" — the 27-row list docs/OPEN_ITEMS.md #1 asked about), and
// "شركة الشرارة الذهبية.jpeg". تجريف (675)/الرقيبة (703)/زاوية مرزق (2011)
// are deliberately NOT repeated here — those three are already seeded
// above as the station-card-field-spec's own worked examples, with the
// same phone numbers confirming they're the same real stations.
//
// internalCode = STN-<company prefix>-<stationNumber> — station numbers
// collide across companies by design (confirmed repeatedly in this real
// data: 408, 828, 858 each appear under two different companies here),
// exactly the case (companyId, stationNumber) exists to allow per
// CLAUDE.md rule 1; the prefix keeps internalCode itself globally unique
// too.
interface RealStationSpec {
  company: string;
  stationNumber: string;
  name: string;
  municipality: string;
  route?: string;
  ownershipType?: 'GOVERNMENT' | 'PRIVATE';
  status?: string;
  statusNote?: string;
  supervisorName?: string;
  supervisorPhone?: string;
  operatorName?: string;
  operatorPhone?: string;
  fuel?: { PETROL_95: boolean; DIESEL: boolean; KEROSENE: boolean };
}

const COMPANY_PREFIX: Record<string, string> = {
  'البريقة': 'BRQ',
  'الثقة الدولية': 'THQ',
  'ليبيا نفط': 'LBY',
  'الطرق السريعة': 'HWY',
  'الراحلة': 'RHL',
  'الشرارة الذهبية': 'SHR',
};

const REAL_STATIONS: RealStationSpec[] = [
  // ── البريقة (محطات.txt) ────────────────────────────────────────────
  { company: 'البريقة', stationNumber: '1080', name: 'واحات النماء', municipality: 'سبها' },
  { company: 'البريقة', stationNumber: '1069', name: 'النصر', municipality: 'الشاطئ' },
  { company: 'البريقة', stationNumber: '1070', name: 'دروب فزان', municipality: 'اشكدة' },
  { company: 'البريقة', stationNumber: '1097', name: 'شواطئ ليبيا', municipality: 'الشاطئ' },
  {
    company: 'البريقة',
    stationNumber: '1063',
    name: 'غدوة',
    municipality: 'غدوة',
    status: 'SUSPENDED_LEGAL',
    statusNote: 'مقفلة من النائب العام',
  },

  // ── الثقة الدولية (محطات.txt) ──────────────────────────────────────
  { company: 'الثقة الدولية', stationNumber: '2006', name: 'العطاء الدائم', municipality: 'سمنو' },
  {
    company: 'الثقة الدولية',
    stationNumber: '2007',
    name: 'ربيع الجنوب',
    municipality: 'سبها',
    status: 'SUSPENDED_LEGAL',
    statusNote: 'موقوفة من النائب العام',
  },
  { company: 'الثقة الدولية', stationNumber: '2013', name: 'العافية', municipality: 'براك' },
  { company: 'الثقة الدولية', stationNumber: '2014', name: 'الحطية', municipality: 'القرضة' },
  { company: 'الثقة الدولية', stationNumber: '2016', name: 'أشكدة', municipality: 'اشكدة' },
  { company: 'الثقة الدولية', stationNumber: '2020', name: 'فزان الخير', municipality: 'تمنهنت' },
  { company: 'الثقة الدولية', stationNumber: '2022', name: 'الصخرات', municipality: 'أم الأرانب' },
  { company: 'الثقة الدولية', stationNumber: '2028', name: 'الشاطي الذهبي', municipality: 'فنقل' },
  {
    company: 'الثقة الدولية',
    stationNumber: '2030',
    name: 'البروج',
    municipality: 'أم الأرانب',
    status: 'SUSPENDED_COMMITTEE',
    statusNote: 'موقوفة من اللجنة',
  },
  {
    company: 'الثقة الدولية',
    stationNumber: '2010',
    name: 'غدوة',
    municipality: 'غدوة',
    status: 'SUSPENDED_LEGAL',
    statusNote: 'موقوفة من النائب العام',
  },

  // ── ليبيا نفط (كشف محطات شركة نفط ليبيا — مكتب المنطقة الجنوبية) ───
  {
    company: 'ليبيا نفط',
    stationNumber: '667',
    name: 'براك',
    municipality: 'الشاطئ',
    supervisorName: 'محمد عمر',
    supervisorPhone: '0928800088',
    operatorPhone: '0912125692',
    status: 'SUSPENDED_COMMITTEE',
    statusNote: 'قفلت من قبل لجنة الوقود',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '671',
    name: 'القرصة',
    municipality: 'الشاطئ',
    supervisorName: 'أبوبكر امحمد',
    supervisorPhone: '0926861438',
    status: 'SUSPENDED_COMMITTEE',
    statusNote: 'قفلت من قبل لجنة الوقود',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '681',
    name: 'المنشية',
    municipality: 'سبها',
    supervisorName: 'عبدالرحمن ادريس',
    supervisorPhone: '0912112085',
    operatorName: 'أبوبكر',
    operatorPhone: '0925357774',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '685',
    name: 'الكاصرة',
    municipality: 'غدوة',
    supervisorName: 'نجم علي مختار',
    supervisorPhone: '0911251010',
    operatorName: 'علي حلاي',
    operatorPhone: '0925356819',
    status: 'SUSPENDED_COMMITTEE',
    statusNote: 'قفلت من قبل لجنة الوقود',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '687',
    name: 'غدوة',
    municipality: 'غدوة',
    supervisorName: 'عبدالقادر عبدالفتاحي',
    supervisorPhone: '0926169065',
    status: 'NOT_YET_SUPPLIED',
    statusNote: 'مقفلة، تحتاج إلى محول كهرباء',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '689',
    name: 'تراغن',
    municipality: 'تراغن',
    supervisorName: 'عبدالسلام أحمد سريح',
    supervisorPhone: '0923391250',
    operatorName: 'حمزة عبدالسلام سريح',
    operatorPhone: '0927694933',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '895',
    name: 'القطرون',
    municipality: 'القطرون',
    supervisorName: 'فضل عبدالله عبدالله',
    supervisorPhone: '0914190255',
    operatorName: 'عبدالسلام المهدي',
    operatorPhone: '0928774052',
    status: 'NOT_YET_SUPPLIED',
    statusNote: 'مقفلة، تحتاج إلى محول كهرباء',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '717',
    name: 'غات',
    municipality: 'غات',
    supervisorName: 'صالح عبدالله',
    supervisorPhone: '0923083172',
    operatorName: 'ربيع صالح',
    operatorPhone: '0945171976',
    status: 'SUSPENDED_OWNER',
    statusNote: 'قفلت نتيجة رفض المالك تسلّم المحطة',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '723',
    name: 'سنو',
    municipality: 'سمنو',
    supervisorName: 'محمد عكاشة',
    supervisorPhone: '0922465207',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '729',
    name: 'مرزق',
    municipality: 'مرزق',
    supervisorName: 'خالد صوفو',
    supervisorPhone: '0925213055',
    operatorName: 'رمضان حسن موسى',
    operatorPhone: '0925135433',
    status: 'SUSPENDED_COMMITTEE',
    statusNote: 'قفلت من قبل لجنة الوقود',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '731',
    name: 'مكنوسة',
    municipality: 'مكنوسة',
    supervisorName: 'أحمد عبدالرحمن',
    supervisorPhone: '0926624375',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '733',
    name: 'جرمة',
    municipality: 'جرمة',
    supervisorName: 'ابراهيم أبو سويلم',
    supervisorPhone: '0924254807',
    operatorName: 'محمد ابراهيم',
    operatorPhone: '0911081416',
  },
  {
    company: 'ليبيا نفط',
    stationNumber: '741',
    name: 'الأبيض',
    municipality: 'الأبيض',
    supervisorName: 'مسعود عثمان حسن',
    supervisorPhone: '0925144844',
    operatorName: 'عبدالسلام مسعود',
    operatorPhone: '0925143618',
  },

  // ── الطرق السريعة (كشف بالمحطات — تُزوَّد من مستودع سبها النفطي) ────
  // All 20 marked عاملة (working) with بنزين 95 + ديزل, لا كيروسين.
  { company: 'الطرق السريعة', stationNumber: '304', name: 'الثقة', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '314', name: 'طريق الحياة', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '311', name: 'رواد الجنوب', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '315', name: 'سلطان الجنوب', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '320', name: 'شرق المطار', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '321', name: 'سبل السلام', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '405', name: 'حجارة الجديدة', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '408', name: 'القرضابية', municipality: 'سبها', route: 'خط سبها' },
  { company: 'الطرق السريعة', stationNumber: '312', name: 'أنوار الجبل', municipality: 'براك', route: 'خط الشاطئ' },
  { company: 'الطرق السريعة', stationNumber: '322', name: 'طريق الجنوب', municipality: 'قيرة', route: 'خط الشاطئ' },
  { company: 'الطرق السريعة', stationNumber: '323', name: 'الدانري الجديد', municipality: 'براك', route: 'خط الشاطئ' },
  { company: 'الطرق السريعة', stationNumber: '318', name: 'وادي سيل', municipality: 'الزوية', route: 'خط الشاطئ' },
  { company: 'الطرق السريعة', stationNumber: '406', name: 'اقار', municipality: 'القرضة', route: 'خط الشاطئ' },
  { company: 'الطرق السريعة', stationNumber: '313', name: 'أمواج الصحراء', municipality: 'القطرون', route: 'خط مرزق' },
  { company: 'الطرق السريعة', stationNumber: '308', name: 'صحراء المحبة', municipality: 'مرزق', route: 'خط مرزق' },
  { company: 'الطرق السريعة', stationNumber: '412', name: 'الواحة واحة', municipality: 'مرزق', route: 'خط مرزق' },
  { company: 'الطرق السريعة', stationNumber: '411', name: 'عبر الصحراء', municipality: 'القطرون', route: 'خط مرزق' },
  { company: 'الطرق السريعة', stationNumber: '424', name: 'لجين الخير', municipality: 'الشرقية', route: 'خط مرزق' },
  { company: 'الطرق السريعة', stationNumber: '427', name: 'اكاكوس', municipality: 'القطرون', route: 'خط مرزق' },
  { company: 'الطرق السريعة', stationNumber: '303', name: 'تهالة', municipality: 'تهالة', route: 'خط اوباري' },

  // ── الراحلة (بيانات المحطات — مكتب مبيعات المنطقة الجنوبية) ─────────
  { company: 'الراحلة', stationNumber: '976', name: 'الكاتب', municipality: 'سبها', supervisorName: 'عماد علي ابراهيم', supervisorPhone: '0925137146' },
  { company: 'الراحلة', stationNumber: '725', name: 'عبدالكافي', municipality: 'سبها', supervisorName: 'عبدالقادر مسعود', supervisorPhone: '0912410807' },
  { company: 'الراحلة', stationNumber: '932', name: 'رياض ليبيا', municipality: 'سبها', supervisorName: 'ابراهيم محمد محمود', supervisorPhone: '0925135247' },
  { company: 'الراحلة', stationNumber: '998', name: 'بشائر الخير', municipality: 'قيرة', supervisorName: 'ابراهيم امحمد بشير', supervisorPhone: '0925747077' },
  { company: 'الراحلة', stationNumber: '950', name: 'سما الجنوب', municipality: 'قيرة', supervisorName: 'ابوبكر حماد الهادي', supervisorPhone: '0922121219' },
  { company: 'الراحلة', stationNumber: '276', name: 'الربيان', municipality: 'قيرة', supervisorName: 'عبدالسميع منصور', supervisorPhone: '0915099026' },
  { company: 'الراحلة', stationNumber: '874', name: 'عين النص', municipality: 'تامزاوة', supervisorName: 'يوسف ابوبكر', supervisorPhone: '0923016894' },
  { company: 'الراحلة', stationNumber: '842', name: 'قطة', municipality: 'الشاطئ', supervisorName: 'محمد مسعود علي', supervisorPhone: '0925756623' },
  { company: 'الراحلة', stationNumber: '673', name: 'برقن', municipality: 'الشاطئ', supervisorName: 'ضو ابراهيم علي', supervisorPhone: '0927762515' },
  { company: 'الراحلة', stationNumber: '904', name: 'بن ناموس', municipality: 'الشاطئ', supervisorName: 'محمد زايد خليفة (الوكيل)', supervisorPhone: '0924431907' },
  { company: 'الراحلة', stationNumber: '739', name: 'تامزاوة', municipality: 'تامزاوة', supervisorName: 'ابوعجيلة سليمان', supervisorPhone: '0923931359' },
  { company: 'الراحلة', stationNumber: '804', name: 'الديدبان', municipality: 'ثاروت', supervisorName: 'هانيبال الهادي', supervisorPhone: '0923274192' },
  { company: 'الراحلة', stationNumber: '705', name: 'بنت بيه', municipality: 'بنت بيه', supervisorName: 'ابراهيم امبارك الدليو', supervisorPhone: '0925341909' },
  { company: 'الراحلة', stationNumber: '408', name: 'الرميلة', municipality: 'القرايا', supervisorName: 'منصور الطاهر علي', supervisorPhone: '0925353537' },
  { company: 'الراحلة', stationNumber: '709', name: 'الغريفة', municipality: 'الغريفة', supervisorName: 'مفتاح عبدالسلام غيث', supervisorPhone: '0925223710' },
  { company: 'الراحلة', stationNumber: '715', name: 'العوينات', municipality: 'العوينات', supervisorName: 'موسى ساسي', supervisorPhone: '0927368323' },
  { company: 'الراحلة', stationNumber: '735', name: 'البركت', municipality: 'البركت', supervisorName: 'علي الشاضي عبدالله', supervisorPhone: '0918980498' },
  { company: 'الراحلة', stationNumber: '342', name: 'الميزة العالية', municipality: 'غدوة', supervisorName: 'سعيد محمد', supervisorPhone: '0925140682' },
  { company: 'الراحلة', stationNumber: '858', name: 'أبناء السبتي', municipality: 'جيزاو', supervisorName: 'دالكفل عياد عبدالسلام (الوكيل)', supervisorPhone: '0914191490' },
  { company: 'الراحلة', stationNumber: '693', name: 'زويلة', municipality: 'زويلة', supervisorName: 'عمر الشريف', supervisorPhone: '0925352505' },
  { company: 'الراحلة', stationNumber: '699', name: 'السبيطات', municipality: 'السبيطات', supervisorName: 'ابراهيم عبدالله', supervisorPhone: '0928109271' },
  { company: 'الراحلة', stationNumber: '428', name: 'قصر مسعود', municipality: 'القطرون', supervisorName: 'احميدة اوكيه', supervisorPhone: '0924554664' },
  { company: 'الراحلة', stationNumber: '679', name: 'تمنهنت', municipality: 'تمنهنت', supervisorName: 'هشام ابوبكر أحسين', supervisorPhone: '0911262877' },
  { company: 'الراحلة', stationNumber: '896', name: 'الميزة', municipality: 'سمنو', supervisorName: 'محمد احسونة', supervisorPhone: '0925343550' },
  { company: 'الراحلة', stationNumber: '236', name: 'ربوع البوانيس', municipality: 'سمنو', supervisorName: 'عياد علي النقراط', supervisorPhone: '0913208112' },
  { company: 'الراحلة', stationNumber: '876', name: 'الزيغن', municipality: 'الزيغن', supervisorName: 'خالد صالح السنوسي', supervisorPhone: '0919980800' },
  { company: 'الراحلة', stationNumber: '828', name: 'بوابة الجنوب', municipality: 'الشويرف', supervisorName: 'علي القدافي', supervisorPhone: '0914377206' },

  // ── الشرارة الذهبية للخدمات النفطية (كشف لمحطات المنطقة الجنوبية) ──
  { company: 'الشرارة الذهبية', stationNumber: '669', name: 'قيرة', municipality: 'الشاطئ', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '677', name: 'أدرى', municipality: 'الشاطئ', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '691', name: 'أم الأرانب', municipality: 'أم الأرانب', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '697', name: 'المجدول', municipality: 'المجدول', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '701', name: 'تساوة', municipality: 'تساوة', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '707', name: 'قراقرة', municipality: 'قراقرة', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '711', name: 'أوباري', municipality: 'أوباري', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '721', name: 'سبها (بردي)', municipality: 'بردي', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '727', name: 'ونزريك', municipality: 'ونزريك', ownershipType: 'GOVERNMENT' },
  { company: 'الشرارة الذهبية', stationNumber: '743', name: 'تمسة', municipality: 'تمسة', ownershipType: 'GOVERNMENT' },
  {
    company: 'الشرارة الذهبية',
    stationNumber: '036',
    name: 'المصلى',
    municipality: 'براك',
    ownershipType: 'PRIVATE',
    status: 'SUSPENDED_COMMITTEE',
    statusNote: 'متوقفة من قبل لجنة الأزمة',
  },
  { company: 'الشرارة الذهبية', stationNumber: '046', name: 'صحراء المحبة', municipality: 'البدير', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '056', name: 'قافلة السلام', municipality: 'براك', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '136', name: 'تل الماء', municipality: 'سبها', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '140', name: 'الاتقان الأمثل', municipality: 'براك', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '258', name: 'مغدر بوشة', municipality: 'حجارة', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '270', name: 'عبدالقادر عويدات', municipality: 'الشاطئ', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '274', name: 'وادى مغاديت', municipality: 'الزهراء', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '294', name: 'فرج البريكي', municipality: 'تمنهنت', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '344', name: 'عبدالرحمن الصالحين', municipality: 'قبرعون', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '348', name: 'تراغن', municipality: 'تراغن', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '818', name: 'وادي الحياة', municipality: 'اخليف', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '826', name: 'بوابة الصحراء', municipality: 'سبها', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '850', name: 'الامل', municipality: 'سبها', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '858', name: 'الفاطمية', municipality: 'مرزق', ownershipType: 'PRIVATE' },
  { company: 'الشرارة الذهبية', stationNumber: '864', name: 'اشكدة', municipality: 'اشكدة', ownershipType: 'PRIVATE' },
  {
    company: 'الشرارة الذهبية',
    stationNumber: '828',
    name: 'أبناء الصكلول',
    municipality: 'القرضة',
    ownershipType: 'PRIVATE',
    status: 'SUSPENDED_OWNER',
    statusNote: 'متوقفة من مالك المحطة',
  },
  {
    company: 'الشرارة الذهبية',
    stationNumber: '836',
    name: 'المثلث',
    municipality: 'المثلث',
    ownershipType: 'PRIVATE',
    status: 'SUSPENDED_OWNER',
    statusNote: 'متوقفة من مالك المحطة',
  },
  {
    company: 'الشرارة الذهبية',
    stationNumber: '108',
    name: 'السلسبيل',
    municipality: 'حجارة',
    ownershipType: 'PRIVATE',
    status: 'SUSPENDED_OWNER',
    statusNote: 'متوقفة من مالك المحطة',
  },
];

// apps/web/e2e/global-setup.ts creates real data through the real HTTP API
// on every Playwright run (company/station/driver/vehicle/fill-up, always
// prefixed "PW ") and never deletes it — there are no DELETE endpoints for
// any of these, by design (CLAUDE.md). Left alone, this accumulates in a
// dev DB and is exactly what a manual tester runs into when browsing the
// driver/vehicle lists. Seed-time cleanup via direct Prisma access (not
// the API) is the only place that can safely remove it, in FK-safe order.
// Wrapped so a failure here (e.g. an interrupted Playwright run leaving
// yet another shape of partial data) never blocks the rest of the seed.
async function cleanupPlaywrightFixtures(): Promise<void> {
  try {
    const [pwVehicles, pwOwners, pwStations, pwCompanies, pwUsers] = await Promise.all([
      prisma.vehicle.findMany({ where: { internalCode: { startsWith: 'PW-VEH-' } } }),
      prisma.vehicleOwner.findMany({ where: { fullName: { startsWith: 'PW Test Owner ' } } }),
      prisma.station.findMany({ where: { internalCode: { startsWith: 'PW-STN-' } } }),
      prisma.company.findMany({ where: { name: { startsWith: 'PW Test Co ' } } }),
      prisma.user.findMany({ where: { username: { startsWith: 'pw_needschange_' } } }),
    ]);
    const vehicleIds = pwVehicles.map((v) => v.id);
    const ownerIds = pwOwners.map((o) => o.id);
    const stationIds = pwStations.map((s) => s.id);
    const companyIds = pwCompanies.map((c) => c.id);
    const userIds = pwUsers.map((u) => u.id);

    if (!vehicleIds.length && !ownerIds.length && !stationIds.length && !companyIds.length && !userIds.length) {
      return;
    }

    const fillUpFilter = {
      OR: [
        { vehicleId: { in: vehicleIds } },
        { stationId: { in: stationIds } },
      ],
    };
    await prisma.exception.deleteMany({ where: { fillUpTransaction: fillUpFilter } });
    await prisma.fillUpTransaction.deleteMany({ where: fillUpFilter });
    await prisma.vehiclePlateHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChassisHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleBookletHistory.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleChangeRequest.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.vehicleOwner.deleteMany({ where: { id: { in: ownerIds } } });
    await prisma.userStationScope.deleteMany({
      where: { OR: [{ stationId: { in: stationIds } }, { userId: { in: userIds } }] },
    });
    await prisma.station.deleteMany({ where: { id: { in: stationIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    console.log(
      `  🧹 Cleaned up Playwright e2e fixtures: ${vehicleIds.length} vehicles, ${ownerIds.length} owners, ${stationIds.length} stations, ${companyIds.length} companies, ${userIds.length} throwaway users.`,
    );
  } catch (error) {
    console.warn('  ⚠ Playwright fixture cleanup failed (non-fatal, continuing seed):', error);
  }
}

async function main() {
  await cleanupPlaywrightFixtures();

  // ── Companies ──────────────────────────────────────────────────────
  const companiesByName = new Map<string, { id: string }>();
  for (const name of COMPANIES) {
    const company = await prisma.company.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    companiesByName.set(name, company);
  }

  // ── Municipalities, routes, security authorities ────────────────────
  const municipalitiesByName = new Map<string, { id: string }>();
  for (const name of MUNICIPALITIES) {
    const status = LIVE_MUNICIPALITIES.has(name) ? ('LIVE' as const) : undefined;
    const municipality = await prisma.municipality.upsert({
      where: { name },
      create: { name, status },
      update: status ? { status } : {},
    });
    municipalitiesByName.set(name, municipality);
  }

  const routesByName = new Map<string, { id: string }>();
  for (const name of ROUTES) {
    const route = await prisma.route.upsert({ where: { name }, create: { name }, update: {} });
    routesByName.set(name, route);
  }

  // Each authority is tied to its one municipality; stations get their
  // authority from there (no per-station field any more).
  for (const authority of SECURITY_AUTHORITIES) {
    const municipalityId = municipalitiesByName.get(authority.municipality)!.id;
    await prisma.securityAuthority.upsert({
      where: { name: authority.name },
      create: { name: authority.name, municipalityId },
      update: { municipalityId },
    });
  }

  const vehicleTypesByName = new Map<string, { id: string }>();
  for (const name of VEHICLE_TYPES) {
    const vehicleType = await prisma.vehicleType.upsert({ where: { name }, create: { name }, update: {} });
    vehicleTypesByName.set(name, vehicleType);
  }

  // ── Permissions & Roles ────────────────────────────────────────────
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { description: permission.description },
    });
  }

  const rolesByName = new Map<string, { id: string }>();
  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const unrestrictedStationAccess = UNRESTRICTED_STATION_ACCESS_ROLES.has(roleName);
    const role = await prisma.role.upsert({
      where: { name: roleName },
      create: { name: roleName, unrestrictedStationAccess },
      update: { unrestrictedStationAccess },
    });
    rolesByName.set(roleName, role);

    for (const key of permissionKeys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }

  // ── System settings ───────────────────────────────────────────────
  for (const setting of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: { value: setting.value, description: setting.description },
    });
  }

  // ── Exception types ────────────────────────────────────────────────
  for (const exceptionType of EXCEPTION_TYPES) {
    await prisma.exceptionType.upsert({
      where: { key: exceptionType.key },
      create: exceptionType,
      update: { name: exceptionType.name, requiresProof: exceptionType.requiresProof },
    });
  }

  // ── Stations ───────────────────────────────────────────────────────
  // We do not have the client's real station list yet (docs/OPEN_ITEMS.md
  // #1, #2, #3, #10 are all still pending). These are synthetic fixtures —
  // enough to exercise RBAC/scoping and prove the schema, not real data.
  // Two stations deliberately share stationNumber "1" across different
  // companies, demonstrating exactly the case the composite unique key
  // (companyId, stationNumber) exists to allow.
  const raheela = companiesByName.get('الراحلة')!;
  const sharara = companiesByName.get('الشرارة الذهبية')!;
  const sabhaMunicipalityId = municipalitiesByName.get('سبها')!.id;

  const stationA = await prisma.station.upsert({
    where: { internalCode: 'STN-TEST-0001' },
    create: {
      internalCode: 'STN-TEST-0001',
      stationNumber: '1',
      name: 'Test Station (Raheela) — synthetic fixture',
      companyId: raheela.id,
      municipalityId: sabhaMunicipalityId,
    },
    // Placed in سبها (live) so the scoped test accounts (employee1,
    // supervisor1) can record fill-ups here — also on an existing DB.
    update: { municipalityId: sabhaMunicipalityId },
  });

  const stationB = await prisma.station.upsert({
    where: { internalCode: 'STN-TEST-0002' },
    create: {
      internalCode: 'STN-TEST-0002',
      stationNumber: '1', // same number as stationA, different company — proves the composite key
      name: 'Test Station (Sharara) — synthetic fixture',
      companyId: sharara.id,
      municipalityId: sabhaMunicipalityId,
    },
    update: { municipalityId: sabhaMunicipalityId },
  });

  // station-card-field-spec's own three worked examples — small,
  // deliberate seed rows to prove the card's shape holds up against real
  // field data, not a real import (the doc's own closing line: "next step
  // is adding these three ... as real seed rows for testing").
  const libyaOil = companiesByName.get('ليبيا نفط')!;
  const thiqaDawliya = companiesByName.get('الثقة الدولية')!;

  // تجريف — supervisor and operator are two different people, the more
  // complex case.
  await prisma.station.upsert({
    where: { internalCode: 'STN-EX-0675' },
    create: {
      internalCode: 'STN-EX-0675',
      stationNumber: '675',
      name: 'تجريف',
      companyId: libyaOil.id,
      municipalityId: municipalitiesByName.get('المطرود')!.id,
      ownershipType: 'GOVERNMENT',
      status: 'ACTIVE',
      supervisorName: 'رمضان رافع',
      supervisorPhone: '926536568',
      operatorName: 'الصديق فتحي الله',
      operatorPhone: '928892435',
      fuelAvailability: {
        create: [
          { fuelType: 'PETROL_95', isAvailable: true },
          { fuelType: 'DIESEL', isAvailable: true },
          { fuelType: 'KEROSENE', isAvailable: false },
        ],
      },
    },
    update: {},
  });

  // الرقيبة — the simpler "operator = supervisor" case.
  await prisma.station.upsert({
    where: { internalCode: 'STN-EX-0703' },
    create: {
      internalCode: 'STN-EX-0703',
      stationNumber: '703',
      name: 'الرقيبة',
      companyId: libyaOil.id,
      municipalityId: municipalitiesByName.get('الرقيبة')!.id,
      ownershipType: 'GOVERNMENT',
      status: 'ACTIVE',
      supervisorName: 'طاهر علي مدنية',
      supervisorPhone: '925353537',
      operatorSameAsSupervisor: true,
    },
    update: {},
  });

  // زاوية مرزق — the opposite extreme: almost nothing known yet, which
  // the card needs to handle gracefully (name + number + location + a
  // closure reason, nothing else).
  await prisma.station.upsert({
    where: { internalCode: 'STN-EX-2011' },
    create: {
      internalCode: 'STN-EX-2011',
      stationNumber: '2011',
      name: 'زاوية مرزق',
      companyId: thiqaDawliya.id,
      municipalityId: municipalitiesByName.get('مرزق')!.id,
      status: 'NOT_YET_SUPPLIED',
      statusNote: 'لم يتم تزويدها',
    },
    update: {},
  });

  // ── Real station rosters (round 17) ─────────────────────────────────
  const realStationsByInternalCode = new Map<string, { id: string; municipalityId: string | null }>();
  for (const spec of REAL_STATIONS) {
    const company = companiesByName.get(spec.company)!;
    let municipality = municipalitiesByName.get(spec.municipality);
    if (!municipality) {
      // Belt-and-suspenders — every name in REAL_STATIONS should already
      // be in MUNICIPALITIES above, but a real reseed should never 500 on
      // a typo mismatch between the two lists.
      municipality = await prisma.municipality.upsert({
        where: { name: spec.municipality },
        create: { name: spec.municipality },
        update: {},
      });
      municipalitiesByName.set(spec.municipality, municipality);
    }
    const route = spec.route ? routesByName.get(spec.route) : undefined;
    const internalCode = `STN-${COMPANY_PREFIX[spec.company]}-${spec.stationNumber}`;
    // الطرق السريعة's own roster confirms all 20 stations carry بنزين 95 +
    // ديزل, لا كيروسين — applied once here rather than repeated on every row.
    const fuel = spec.fuel ?? (spec.company === 'الطرق السريعة' ? { PETROL_95: true, DIESEL: true, KEROSENE: false } : undefined);

    const station = await prisma.station.upsert({
      where: { internalCode },
      create: {
        internalCode,
        stationNumber: spec.stationNumber,
        name: spec.name,
        companyId: company.id,
        municipalityId: municipality.id,
        routeId: route?.id,
        ownershipType: spec.ownershipType,
        status: spec.status ?? 'ACTIVE',
        statusNote: spec.statusNote,
        supervisorName: spec.supervisorName,
        supervisorPhone: spec.supervisorPhone,
        operatorName: spec.operatorName,
        operatorPhone: spec.operatorPhone,
        operatorSameAsSupervisor: !spec.operatorName && !spec.operatorPhone,
        fuelAvailability: fuel
          ? {
              create: [
                { fuelType: 'PETROL_95', isAvailable: fuel.PETROL_95 },
                { fuelType: 'DIESEL', isAvailable: fuel.DIESEL },
                { fuelType: 'KEROSENE', isAvailable: fuel.KEROSENE },
              ],
            }
          : undefined,
      },
      update: {},
    });
    realStationsByInternalCode.set(internalCode, station);
  }

  // ── Test users, one per role ───────────────────────────────────────
  const testUsers = [
    { username: 'employee1', fullName: 'Test Station Employee', role: 'station_employee' },
    { username: 'supervisor1', fullName: 'Test Station Supervisor', role: 'station_supervisor' },
    { username: 'admin1', fullName: 'Test Directorate Admin', role: 'directorate_admin' },
    { username: 'sysadmin1', fullName: 'Test System Admin', role: 'system_admin' },
  ];

  const usersByUsername = new Map<string, { id: string }>();
  for (const spec of testUsers) {
    const passwordHash = await argon2.hash('ChangeMe123!');
    const user = await prisma.user.upsert({
      where: { username: spec.username },
      create: {
        username: spec.username,
        fullName: spec.fullName,
        passwordHash,
        mustChangePassword: true,
      },
      update: {},
    });
    usersByUsername.set(spec.username, user);

    const role = rolesByName.get(spec.role)!;
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });

    if (spec.username === 'employee1') {
      // Scoped to stationA only — the fixture the boundary e2e test relies on.
      await prisma.userStationScope.upsert({
        where: { userId_stationId: { userId: user.id, stationId: stationA.id } },
        create: { userId: user.id, stationId: stationA.id },
        update: {},
      });
    }

    if (spec.username === 'supervisor1') {
      // Scoped to stationA only — supervisors are station-scoped by role
      // design (no reports:view_all_stations), so the test account needs a
      // station to supervise or every station-scoped screen shows nothing.
      await prisma.userStationScope.upsert({
        where: { userId_stationId: { userId: user.id, stationId: stationA.id } },
        create: { userId: user.id, stationId: stationA.id },
        update: {},
      });
    }
  }

  // ── Owners ────────────────────────────────────────────────────────
  // Round 6: VehicleOwner now has (identityType, identityNumber) unique,
  // same shape as Driver — a real upsert instead of the old manual
  // find-then-create.
  const ownersByKey = new Map<string, { id: string }>();
  for (const spec of SEED_OWNERS) {
    const owner = await prisma.vehicleOwner.upsert({
      where: { identityType_identityNumber: { identityType: spec.identityType, identityNumber: spec.identityNumber } },
      create: {
        identityType: spec.identityType,
        identityNumber: spec.identityNumber,
        fullName: spec.fullName,
        phone: spec.phone,
      },
      update: {},
    });
    ownersByKey.set(spec.key, owner);
  }

  // ── Drivers ───────────────────────────────────────────────────────
  const driversByKey = new Map<string, { id: string }>();
  for (const spec of SEED_DRIVERS) {
    const driver = await prisma.driver.upsert({
      where: { identityType_identityNumber: { identityType: spec.identityType, identityNumber: spec.identityNumber } },
      create: {
        identityType: spec.identityType,
        identityNumber: spec.identityNumber,
        fullName: spec.fullName,
        phone: spec.phone,
      },
      update: {},
    });
    driversByKey.set(spec.key, driver);
  }

  // ── Vehicles, plate history, driver associations, fill-up history ──
  const stationsByKey = new Map([
    ['A', stationA],
    ['B', stationB],
    // Round 17: a handful of the newly-seeded real stations, so the
    // expanded vehicle fixtures below record fill-up history at real
    // client-provided stations instead of only the two synthetic ones.
    ['THIQA', realStationsByInternalCode.get('STN-HWY-304')!],
    ['RAWWAD', realStationsByInternalCode.get('STN-HWY-311')!],
    ['TRAGHEN', realStationsByInternalCode.get('STN-LBY-689')!],
    ['MURZUQ', realStationsByInternalCode.get('STN-LBY-729')!],
    ['KATIB', realStationsByInternalCode.get('STN-RHL-976')!],
    ['OBARI', realStationsByInternalCode.get('STN-SHR-711')!],
    ['AFIYA', realStationsByInternalCode.get('STN-THQ-2013')!],
    ['NAMAA', realStationsByInternalCode.get('STN-BRQ-1080')!],
  ]);
  const recordedBy = usersByUsername.get('sysadmin1')!;

  for (const spec of SEED_VEHICLES) {
    const vehicle = await prisma.vehicle.upsert({
      where: { internalCode: spec.internalCode },
      create: {
        internalCode: spec.internalCode,
        currentPlate: spec.currentPlate,
        chassisNumber: spec.chassisNumber,
        vehicleTypeId: vehicleTypesByName.get(spec.vehicleType)?.id,
        model: spec.model,
        color: spec.color,
        manufactureYear: spec.manufactureYear,
        usageType: spec.usageType,
        ownerId: spec.ownerKey ? ownersByKey.get(spec.ownerKey)!.id : null,
      },
      update: {},
    });

    // Plate history: V1 gets 2 rows (an older closed one, then the current
    // open one) to exercise the plate-history UI path — every other
    // vehicle gets the single current-plate row VehiclesService.create
    // would normally seed, so plate-change still has something to close.
    const plateHistoryEntries = 'plateHistory' in spec ? spec.plateHistory : [spec.currentPlate];
    for (let i = 0; i < plateHistoryEntries.length; i++) {
      const plate = plateHistoryEntries[i]!;
      const isOpen = i === plateHistoryEntries.length - 1;
      const existingRow = await prisma.vehiclePlateHistory.findFirst({ where: { vehicleId: vehicle.id, plate } });
      if (existingRow) continue;
      const stepsFromOpen = plateHistoryEntries.length - 1 - i;
      await prisma.vehiclePlateHistory.create({
        data: {
          vehicleId: vehicle.id,
          plate,
          validFrom: new Date(Date.now() - (stepsFromOpen + 1) * 30 * 24 * 60 * 60 * 1000),
          validTo: isOpen ? null : new Date(Date.now() - stepsFromOpen * 30 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Driver associations — V1 gets 2, exactly one primary.
    for (const driverSpec of spec.drivers) {
      const driver = driversByKey.get(driverSpec.key)!;
      await prisma.driverVehicle.upsert({
        where: { driverId_vehicleId: { driverId: driver.id, vehicleId: vehicle.id } },
        create: { driverId: driver.id, vehicleId: vehicle.id, isPrimary: driverSpec.isPrimary },
        update: { isPrimary: driverSpec.isPrimary },
      });
    }

    // Fill-up history — some vehicles get none at all (the "clean first
    // fill-up" path), some get one recent enough to trip the gap rule on a
    // fresh test submission, some get one old enough to be browsable
    // history without blocking a new one.
    for (const [index, fillUpSpec] of spec.fillUps.entries()) {
      const idempotencyKey = `SEED-FILLUP-${spec.key}-${index}`;
      // Round 6: fill-ups no longer require a driver — rule evaluation and
      // history are keyed to the vehicle/owner instead (see
      // docs/DESIGN_owner_based_fillups.md). driverId is still written when
      // a historical driver association exists, purely as legacy
      // attribution, never as a requirement to seed the fill-up at all.
      const primaryDriverKey = spec.drivers[0]?.key;
      const driver = primaryDriverKey ? driversByKey.get(primaryDriverKey) : undefined;
      const station = stationsByKey.get(fillUpSpec.stationKey)!;
      const occurredAt = new Date(Date.now() - fillUpSpec.daysAgo * 24 * 60 * 60 * 1000);

      await prisma.fillUpTransaction.upsert({
        where: { idempotencyKey },
        create: {
          vehicleId: vehicle.id,
          driverId: driver?.id,
          stationId: station.id,
          // Stamped like FillUpsService does: the station's municipality
          // at the time of the fill-up.
          municipalityId: station.municipalityId,
          fuelType: fillUpSpec.fuelType,
          quantityLiters: fillUpSpec.quantityLiters,
          occurredAt,
          recordedById: recordedBy.id,
          isException: false,
          idempotencyKey,
        },
        update: {},
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Companies: ${COMPANIES.length}`);
  console.log(`  Real stations (round 17 client rosters): ${REAL_STATIONS.length} + 3 station-card-field-spec worked examples`);
  console.log(`  Vehicles: ${SEED_VEHICLES.length}, Owners: ${SEED_OWNERS.length}`);
  console.log(`  Roles: ${Object.keys(ROLE_PERMISSIONS).length}`);
  console.log(`  Test users: ${testUsers.map((u) => u.username).join(', ')} (password: ChangeMe123!)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
