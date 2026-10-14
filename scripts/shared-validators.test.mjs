import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Phase 5A: every field rule (national ID, administrative number, mobile
// numbers, plate, chassis, booklet, year, names) lives ONCE in
// packages/shared-types and is used by the API's DTOs and the web forms. This
// guards against the old drift: hand-kept copies of a regex on each side.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);

const SHARED = '@fuel-tracking/shared-types';

test('the old hand-duplicated regex files are gone', () => {
  assert.equal(existsSync(path.join(root, 'apps/api/src/common/validators/libyan-formats.ts')), false);
  const web = read('apps/web/src/lib/libyanFormats.ts');
  assert.doesNotMatch(web, /export const [A-Z_]+_REGEX\s*=/, 'the web must not keep its own copy of a field regex');
});

test('the API validators run the shared checks', () => {
  for (const file of [
    'apps/api/src/common/validators/shared-field-checks.ts',
    'apps/api/src/common/validators/identity-number.validator.ts',
    'apps/api/src/common/validators/vehicle-change-value.validator.ts',
    'apps/api/src/common/validators/phone-transform.ts',
  ]) {
    assert.ok(read(file).includes(SHARED), `${file} must import from ${SHARED}`);
  }
});

test('the owner, vehicle and user DTOs use those validators, not their own patterns', () => {
  const owner = read('apps/api/src/owners/dto/create-owner.dto.ts');
  assert.match(owner, /IsValidIdentityNumber/);
  assert.match(owner, /IsLibyanMobileNumber/);
  assert.match(owner, /IsOwnerName/);
  const vehicle = read('apps/api/src/vehicles/dto/create-vehicle.dto.ts');
  assert.match(vehicle, /IsChassisNumber/);
  assert.match(vehicle, /IsBookletNumber/);
  assert.match(vehicle, /IsLibyanPlate/);
  assert.match(vehicle, /IsManufactureYearValue/);
  assert.doesNotMatch(vehicle, /@Matches\(/, 'the vehicle DTO must not carry its own regex');
});

test('the web forms run the same shared checks', () => {
  for (const file of [
    'apps/web/src/features/registration/RegistrationPage.tsx',
    'apps/web/src/features/vehicles/OwnerEditForm.tsx',
    'apps/web/src/features/vehicles/VehicleEditForm.tsx',
    'apps/web/src/features/vehicles/ChangeRequestForm.tsx',
    'apps/web/src/features/vehicles/OwnerIdentityChangeRequestForm.tsx',
    'apps/web/src/features/users/UserCreatePage.tsx',
  ]) {
    assert.ok(read(file).includes(SHARED), `${file} must import its rules from ${SHARED}`);
  }
});

test('the shared rules give one answer to both sides', () => {
  // Needs the built package (pnpm build:packages) - the root test script does it.
  const dist = path.join(root, 'packages/shared-types/dist/index.js');
  assert.ok(existsSync(dist), 'packages/shared-types must be built first');
  const shared = require(dist);
  const now = new Date('2026-10-12T09:00:00Z');
  assert.equal(shared.checkNationalId('119900123456', { now }).ok, true);
  assert.equal(shared.checkNationalId('319900123456', { now }).ok, false);
  assert.equal(shared.checkNationalId('120090123456', { now }).ok, false); // 17 years old
  assert.equal(shared.checkNationalId('120080123456', { now }).ok, true); // 18
  assert.equal(shared.normalizePlate('5-123456N') === shared.normalizePlate('5-123456'), false);
  assert.equal(shared.normalizeLibyanMobile('+218912345678'), '0912345678');
  assert.equal(shared.checkChassis('ABCDEFGHJKLMNPRST', false).ok, true);
  assert.equal(shared.checkChassis('ABC123', false).ok, false);
  assert.equal(shared.checkChassis('ABC123', true).ok, true);
});

// UX round: one Arabic number-agreement helper for days, cards, liters ...
test('arabicCount follows Arabic number agreement', () => {
  const { arabicCount } = require(path.join(root, 'packages/shared-types/dist/index.js'));
  assert.equal(arabicCount(0, 'day'), '0 يوم');
  assert.equal(arabicCount(1, 'day'), 'يوم واحد');
  assert.equal(arabicCount(2, 'day'), 'يومان');
  assert.equal(arabicCount(3, 'day'), '3 أيام');
  assert.equal(arabicCount(10, 'day'), '10 أيام');
  assert.equal(arabicCount(11, 'day'), '11 يومًا');
  assert.equal(arabicCount(25, 'day'), '25 يومًا');
  assert.equal(arabicCount(103, 'day'), '103 أيام');
  assert.equal(arabicCount(1, 'card'), 'بطاقة واحدة');
  assert.equal(arabicCount(2, 'card'), 'بطاقتان');
  assert.equal(arabicCount(4, 'card'), '4 بطاقات');
  assert.equal(arabicCount(12, 'card'), '12 بطاقة');
  assert.equal(arabicCount(1, 'liter'), 'لتر واحد');
  assert.equal(arabicCount(1500, 'liter'), '1,500 لترًا');
  assert.equal(arabicCount(1.5, 'liter'), '1.5 لتر');
  assert.equal(arabicCount(5, 'station'), '5 محطات');
  assert.equal(arabicCount(1, 'station'), 'محطة واحدة');
  assert.equal(arabicCount(2, 'day', { oblique: true }), 'يومين');
  assert.equal(arabicCount(4, 'employee', { oblique: true }), '4 موظفين');
  assert.equal(arabicCount(4, 'employee'), '4 موظفون');
});
