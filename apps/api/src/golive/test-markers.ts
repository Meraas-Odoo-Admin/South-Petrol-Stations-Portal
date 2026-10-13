// How test data is recognised. Everything the go-live clean-up removes is
// found through the rules in this one file, so what "test data" means can be
// read - and argued with - in one place.
//
// The rules are deliberately about NAMES the test tooling gives its rows, not
// about the data being old or small: a real station, owner or fill-up is never
// matched just because it looks unimportant.

// The accounts seed.ts creates, plus two left behind by early specs.
export const TEST_USERNAMES: readonly string[] = [
  'employee1',
  'supervisor1',
  'registration1',
  'regsupervisor1', // the 5A office manager account (Arabic label renamed, username unchanged)
  'admin1',
  'admin2',
  'sysadmin1',
  'employee3',
  'employee_p2check',
];

// seed-dev-activity (syn_), Playwright (pw_), the API e2e specs (e2e_).
export const TEST_USERNAME_PREFIXES: readonly string[] = ['syn_', 'pw_', 'e2e_'];

export const isTestUsername = (username: string): boolean =>
  TEST_USERNAMES.includes(username) || TEST_USERNAME_PREFIXES.some((p) => username.startsWith(p));

// Municipalities, companies, offices and stations the spec runs and Playwright
// create: «P4B …», «P5A …», «E2E …», «PW …» followed by a space.
export const TEST_NAME_PATTERN = /^(P\d[A-Z]?|E2E|PW)( |$)/;

// Words the Playwright runs and the dev tooling put in the Arabic names they give
// stations, offices, municipalities and companies: «اختبار» (test) and «تجريبي»
// (trial), anywhere in the name, and «synthetic fixture». A real name never
// contains them.
export const TEST_NAME_WORDS = /اختبار|تجريبي|synthetic fixture/i;

export const isTestName = (name: string): boolean =>
  TEST_NAME_PATTERN.test(name) || TEST_NAME_WORDS.test(name) || /^Test Station/.test(name);

// Internal codes the seeds and Playwright use.
export const TEST_STATION_CODE_PREFIXES: readonly string[] = ['STN-TEST-', 'PW-STN-', 'STN-EX-'];
export const TEST_OFFICE_CODE_PREFIXES: readonly string[] = ['REG-TEST-', 'SYN-REG-'];
export const TEST_VEHICLE_CODE_PREFIXES: readonly string[] = ['VEH-SEED-', 'PW-VEH-', 'SYN-'];
export const TEST_FILLUP_KEY_PREFIXES: readonly string[] = ['SEED-FILLUP-', 'syn-', 'pw-', 'e2e', 'e2e_'];
export const SYNTHETIC_REASON_PREFIX = '[synthetic]';
export const SYNTHETIC_WAYBILL_PREFIX = 'SYN-';

// The roster seed.ts used to carry before Phase 5C. Fill-ups left at these
// stations were recorded by test accounts; the prefixes are listed so those
// rows still count as test data after the roster left the seed.
export const LEGACY_SEEDED_STATION_CODE_PREFIXES: readonly string[] = [
  'STN-BRQ-',
  'STN-THQ-',
  'STN-LBY-',
  'STN-HWY-',
  'STN-RHL-',
  'STN-SHR-',
];

// startsWith form of TEST_NAME_PATTERN, for database filters.
export const TEST_NAME_STARTS: readonly string[] = [
  'PW ',
  'E2E ',
  ...Array.from({ length: 10 }, (_, digit) => `P${digit}`),
];
