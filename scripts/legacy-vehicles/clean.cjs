// Cleans the old system's vehicle export (SQL Server table dbo.T_E, saved as
// .xlsx) into files that match this system's database (Khalil, 15 Oct 2026).
//
//   node scripts/legacy-vehicles/clean.cjs data/private/dbo.T_E.xlsx [outDir]
//
// Needs `unzip` and the built shared types (pnpm refresh). Writes ONLY into
// outDir (default data/private/legacy-vehicles/, git-ignored): the export
// holds real people's names and identity numbers, and nothing derived from it
// may enter the repository.
//
// Rules — the same validators as the registration screen
// (packages/shared-types), and the client's decisions of 15 Oct 2026:
//  - plate: digits only, `<city>-<serial>`; a trailing N is removed (Phase 7:
//    Libyan plates carry no letter). No valid plate -> not imported.
//  - owner: a valid national number (12 digits) or administrative number
//    (10 digits, 5/6) and a name. Otherwise the vehicle is NOT imported.
//  - a plate, or a chassis number, found on more than one row: EVERY one of
//    those rows is dropped (none is imported).
//  - chassis: 17 standard characters, or 6-20 marked non-standard; anything
//    else is left empty (the vehicle is still imported, with a warning).
//  - manufacture year 1950..next year, else empty; fuel بنزين/ديزل; colour
//    and make/model spelling made consistent.
//  - the old notes column is never copied: it holds health conditions and
//    nationalities. Phone and coordinates are empty in the export.
const fs = require('fs');
const path = require('path');
const { eachRow } = require('./xlsx-rows.cjs');

const repo = path.resolve(__dirname, '../..');
const shared = require(path.join(repo, 'packages/shared-types/dist/index.js'));
const { normalizePlate, checkNationalId, checkAdministrativeId, checkChassis, normalizeChassis, cleanDigits, checkManufactureYear, VEHICLE_COLORS } =
  shared;

const input = process.argv[2];
const outDir = path.resolve(process.argv[3] ?? path.join(repo, 'data/private/legacy-vehicles'));
if (!input) {
  console.error('Usage: node scripts/legacy-vehicles/clean.cjs <export.xlsx> [outDir]');
  process.exit(1);
}
if (!outDir.startsWith(path.join(repo, 'data', 'private')) && !process.argv.includes('--any-out-dir')) {
  console.error('The output holds personal data: it must go under data/private/ (git-ignored).');
  process.exit(1);
}

// ── text ─────────────────────────────────────────────────────────────

// For comparing Arabic spellings: one alef, final ى as ي, no tatweel or
// diacritics, separators as single spaces.
function arabicKey(s) {
  return s
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى(?=\s|$)/g, 'ي')
    .replace(/[\\/\-_+.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const isNullText = (s) => s === '' || /^(null|NULL|Null)$/.test(s);
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

// ── make and model ───────────────────────────────────────────────────

// Spelling variants found in the export -> one make.
const MAKES = {
  هيونداي: ['هونداي', 'هواندي', 'هيونداي', 'هونداء', 'هيوندا', 'هونداي هونداي'],
  كيا: ['كيا'],
  تويوتا: ['تويوتا', 'تيوتا', 'تايوتا', 'تويتا', 'توبوتا'],
  مرسيدس: ['مرسيدس', 'مرسدس', 'مارسيدس', 'مرسيدس بنز'],
  مازدا: ['مازدا', 'مازادا'],
  سامسونج: ['سامسونج', 'سامسونغ', 'سامسنج'],
  نيسان: ['نيسان', 'نيسات'],
  ميتسوبيشي: ['ميتسوبيشي', 'متشي بيشي', 'متشي', 'ميتشي', 'متسوبيشي', 'ميتسبيشي', 'متسبيشي'],
  فورد: ['فورد'],
  دايو: ['داوو', 'دايو', 'دايوو', 'دايوو'],
  بيجو: ['بيجو'],
  'بي ام دبليو': ['بي ام دبليو', 'بي ام', 'بي م'],
  لكزس: ['لكزس', 'لكسز'],
  شيفروليه: ['شفرليت', 'شفروليه', 'شيفروليه', 'شفرولية', 'شيفرولية', 'شفرلية'],
  ايفيكو: ['افيكو', 'ايفيكو'],
  جيب: ['جيب'],
  اوبل: ['اوبل'],
  سوزوكي: ['سوزي', 'سوزوكي'],
  كرايسلر: ['كرايسلز', 'كرايسلر'],
  دودج: ['دودج'],
  هوندا: ['هوندا'],
  فيات: ['فيات'],
  رينو: ['رينو'],
  فولكسفاجن: ['فولكس', 'فولكس فاجن', 'فلوكس'],
  شيري: ['شيري'],
  جيلي: ['جيلي'],
};
// A model written alone -> its make.
const MODELS = {
  هيونداي: ['سوناتا', 'افانتي', 'النترا', 'فيرنا', 'جرانديور', 'اكسنت', 'توسان', 'سنتافي', 'ازيرا', 'بورتر', 'تراجيت', 'اتوس', 'كوبيه'],
  كيا: ['سيراتو', 'لوتز', 'لوتزي', 'اوبتيما', 'سبورتاج', 'ريو', 'بيكانتو', 'سورينتو', 'كارنفال', 'سيدونا'],
  تويوتا: ['هايلوكس', 'هاي لوكس', 'تندرا', 'كامري', 'كورولا', 'لاندكروزر', 'لاند كروزر', 'يارس'],
  ميتسوبيشي: ['لانسر', 'باجيرو', 'جالانت', 'كنتر'],
};
const MAKE_ALIASES = Object.entries(MAKES)
  .flatMap(([make, aliases]) => aliases.map((a) => ({ make, key: arabicKey(a) })))
  .sort((a, b) => b.key.length - a.key.length);
const MODEL_TO_MAKE = new Map(Object.entries(MODELS).flatMap(([make, models]) => models.map((m) => [arabicKey(m), make])));

function makeAndModel(raw) {
  const key = arabicKey(clean(raw));
  if (!key || isNullText(key)) return { make: null, model: null };
  for (const { make, key: alias } of MAKE_ALIASES) {
    if (key === alias || key.startsWith(`${alias} `)) {
      const model = key.slice(alias.length).trim();
      return { make, model: model ? model.slice(0, 60) : null };
    }
  }
  const firstWord = key.split(' ')[0];
  const twoWords = key.split(' ').slice(0, 2).join(' ');
  const viaModel = MODEL_TO_MAKE.get(twoWords) ?? MODEL_TO_MAKE.get(firstWord);
  if (viaModel) return { make: viaModel, model: key.slice(0, 60) };
  // Not recognised: kept as the make, exactly as written (cleaned).
  return { make: key.slice(0, 60), model: null };
}

// ── colour ───────────────────────────────────────────────────────────

const COLOR_ALIASES = { دهبي: 'ذهبي', رمادي: 'رمادي', بنى: 'بني', كريمه: 'كريمي', كريمة: 'كريمي' };
const COLOR_KEYS = new Map(VEHICLE_COLORS.map((c) => [arabicKey(c), c]));
function colorOf(raw) {
  const key = arabicKey(clean(raw));
  if (!key || isNullText(key)) return null;
  const aliased = COLOR_ALIASES[key] ?? key;
  return COLOR_KEYS.get(arabicKey(aliased)) ?? (aliased.length <= 30 ? aliased : null);
}

// ── plate ────────────────────────────────────────────────────────────

function plateOf(raw) {
  const text = clean(raw);
  if (!text || isNullText(text)) return { plate: null, reason: 'PLATE_MISSING' };
  const withoutN = text.replace(/\s*[Nn]+$/, '');
  const removedN = withoutN !== text;
  if (/[A-Za-z؀-ۿ]/.test(withoutN)) {
    return { plate: null, reason: /لا\s*[يى]?[وز]?[جح]د|لاتوجد|بلا|لايود|لايجد/.test(text) ? 'PLATE_NONE' : 'PLATE_INVALID' };
  }
  const plate = normalizePlate(withoutN);
  return plate ? { plate, removedN } : { plate: null, reason: 'PLATE_INVALID' };
}

// ── owner ────────────────────────────────────────────────────────────

function ownerIdOf(raw) {
  const digits = cleanDigits(clean(raw));
  if (!digits || isNullText(digits)) return { reason: 'OWNER_ID_MISSING' };
  const national = checkNationalId(digits);
  if (national.ok) return { identityType: 'NATIONAL_ID', identityNumber: national.value };
  const admin = checkAdministrativeId(digits);
  if (admin.ok) return { identityType: 'ADMINISTRATIVE_ID', identityNumber: admin.value };
  return { reason: 'OWNER_ID_INVALID', detail: `${national.code ?? ''}/${digits.length}` };
}

function ownerNameOf(raw) {
  // Letters and spaces only: stray slashes, digits and dots dropped.
  const name = clean(String(raw ?? '').replace(/[^؀-ۿA-Za-z\s]/g, ' ')).replace(/\s+/g, ' ');
  return name.length >= 3 && !isNullText(name) ? name : null;
}

// ── the rest ─────────────────────────────────────────────────────────

function chassisOf(raw) {
  const text = clean(raw);
  if (!text || isNullText(text)) return { chassis: null, warn: 'CHASSIS_EMPTY' };
  const value = normalizeChassis(text);
  if (checkChassis(value, false).ok) return { chassis: value, nonStandard: false };
  if (checkChassis(value, true).ok) return { chassis: value, nonStandard: true };
  return { chassis: null, warn: 'CHASSIS_INVALID' };
}
const yearOf = (raw) => {
  const check = checkManufactureYear(clean(raw));
  return check.ok ? Number(check.value) : null;
};
const fuelOf = (raw) => ({ بنزين: 'PETROL', ديزل: 'DIESEL' })[clean(raw)] ?? null;
const excelDay = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000).toISOString().slice(0, 10) : null;
};
const stolenOf = (raw) => ({ نعم: 'نعم', لا: 'لا' })[clean(raw)] ?? '';

const REASONS = {
  PLATE_MISSING: 'لا توجد لوحة',
  PLATE_NONE: 'مكتوب أنه بلا لوحة',
  PLATE_INVALID: 'اللوحة ليست بصيغة رقم المدينة-الرقم التسلسلي',
  OWNER_ID_MISSING: 'رقم هوية المالك فارغ',
  OWNER_ID_INVALID: 'رقم هوية المالك لا يطابق الرقم الوطني ولا الإداري',
  OWNER_NAME_MISSING: 'اسم المالك فارغ أو غير صالح',
  DUPLICATE_PLATE: 'اللوحة مكررة في الملف (حُذفت كل نسخها)',
  DUPLICATE_CHASSIS: 'رقم الهيكل مكرر في الملف (حُذفت كل نسخه)',
};
const WARNINGS = {
  PLATE_N_REMOVED: 'حُذف حرف N من اللوحة',
  CHASSIS_EMPTY: 'رقم الهيكل فارغ',
  CHASSIS_INVALID: 'رقم الهيكل غير صالح فتُرك فارغًا',
  YEAR_DROPPED: 'سنة الصنع غير صالحة فتُركت فارغة',
  FUEL_UNKNOWN: 'نوع الوقود غير معروف',
};

// ── csv ──────────────────────────────────────────────────────────────

function csvLine(values) {
  return values
    .map((v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}
function writeCsv(file, header, rows) {
  // BOM: Excel opens the Arabic correctly.
  fs.writeFileSync(file, '﻿' + [csvLine(header), ...rows.map(csvLine)].join('\r\n') + '\r\n', 'utf8');
}

// ── run ──────────────────────────────────────────────────────────────

(async () => {
  let header;
  const records = [];
  await eachRow(path.resolve(input), 'xl/worksheets/sheet2.xml', (cells) => {
    if (!header) return void (header = cells.map((h) => clean(h)));
    const get = (name) => cells[header.indexOf(name)] ?? '';
    const reasons = [];
    const warnings = [];

    const plate = plateOf(get('number_car'));
    if (!plate.plate) reasons.push(plate.reason);
    if (plate.removedN) warnings.push('PLATE_N_REMOVED');

    const owner = ownerIdOf(get('nid'));
    if (owner.reason) reasons.push(owner.reason);
    const ownerName = ownerNameOf(get('name_sa'));
    if (!ownerName) reasons.push('OWNER_NAME_MISSING');

    const chassis = chassisOf(get('number_shas'));
    if (chassis.warn) warnings.push(chassis.warn);
    const year = yearOf(get('made_yare'));
    if (year === null) warnings.push('YEAR_DROPPED');
    const fuel = fuelOf(get('Type_oil'));
    if (!fuel) warnings.push('FUEL_UNKNOWN');
    const { make, model } = makeAndModel(get('car_type'));

    records.push({
      legacyId: clean(get('id')),
      plate: plate.plate,
      plateRaw: clean(get('number_car')),
      chassis: chassis.chassis,
      chassisNonStandard: chassis.nonStandard === true,
      chassisRaw: clean(get('number_shas')),
      make,
      model,
      year,
      color: colorOf(get('color_car')),
      fuel,
      identityType: owner.identityType ?? null,
      identityNumber: owner.identityNumber ?? null,
      idRaw: clean(get('nid')),
      ownerName,
      ownerNameRaw: clean(get('name_sa')),
      registeredOn: excelDay(get('date_regester_car')),
      office: clean(get('name_mktb')),
      stolen: stolenOf(get('stolen')),
      reasons,
      warnings,
    });
  });

  // Duplicates over the whole file: every row of a repeated plate or chassis.
  const countBy = (key) => {
    const m = new Map();
    for (const r of records) if (r[key]) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
    return m;
  };
  const plateCount = countBy('plate');
  const chassisCount = countBy('chassis');
  for (const r of records) {
    if (r.plate && plateCount.get(r.plate) > 1) r.reasons.push('DUPLICATE_PLATE');
    if (r.chassis && chassisCount.get(r.chassis) > 1) r.reasons.push('DUPLICATE_CHASSIS');
  }

  // How many repeated plates are one vehicle registered more than once (same
  // chassis and same owner on every row) — the client chose to drop them all.
  const groups = new Map();
  for (const r of records) if (r.plate && plateCount.get(r.plate) > 1) groups.set(r.plate, [...(groups.get(r.plate) ?? []), r]);
  let sameVehicleGroups = 0;
  let sameVehicleRows = 0;
  for (const rows of groups.values()) {
    const one = (k) => new Set(rows.map((r) => r[k] ?? '')).size === 1;
    if (one('chassis') && one('identityNumber') && rows[0].identityNumber) {
      sameVehicleGroups++;
      sameVehicleRows += rows.length;
    }
  }

  const kept = records.filter((r) => r.reasons.length === 0);
  const rejected = records.filter((r) => r.reasons.length > 0);

  // Owners: one per identity number; the name of their latest registration.
  const owners = new Map();
  for (const r of kept) {
    const key = `${r.identityType}:${r.identityNumber}`;
    const o = owners.get(key) ?? { identityType: r.identityType, identityNumber: r.identityNumber, names: new Map(), latest: '', name: '', vehicles: 0 };
    o.vehicles++;
    o.names.set(r.ownerName, (o.names.get(r.ownerName) ?? 0) + 1);
    if ((r.registeredOn ?? '') >= o.latest) {
      o.latest = r.registeredOn ?? '';
      o.name = r.ownerName;
    }
    owners.set(key, o);
  }

  fs.mkdirSync(outDir, { recursive: true });
  writeCsv(
    path.join(outDir, 'vehicles-clean.csv'),
    [
      'legacy_id',
      'plate',
      'chassis_number',
      'chassis_non_standard',
      'make',
      'model',
      'manufacture_year',
      'color',
      'fuel_type',
      'owner_identity_type',
      'owner_identity_number',
      'registered_on',
      'legacy_office',
      'legacy_stolen',
      'warnings',
    ],
    kept.map((r) => [
      r.legacyId,
      r.plate,
      r.chassis,
      r.chassisNonStandard ? 'yes' : '',
      r.make,
      r.model,
      r.year,
      r.color,
      r.fuel,
      r.identityType,
      r.identityNumber,
      r.registeredOn,
      r.office,
      r.stolen,
      r.warnings.map((w) => WARNINGS[w]).join(' | '),
    ]),
  );
  writeCsv(
    path.join(outDir, 'owners-clean.csv'),
    ['owner_identity_type', 'owner_identity_number', 'full_name', 'vehicle_count', 'other_spellings'],
    [...owners.values()].map((o) => [
      o.identityType,
      o.identityNumber,
      o.name,
      o.vehicles,
      [...o.names.keys()].filter((n) => n !== o.name).join(' | '),
    ]),
  );
  writeCsv(
    path.join(outDir, 'vehicles-rejected.csv'),
    ['legacy_id', 'reasons', 'plate_as_written', 'chassis_as_written', 'owner_name_as_written', 'owner_id_as_written', 'registered_on', 'legacy_office'],
    rejected.map((r) => [r.legacyId, r.reasons.map((x) => REASONS[x]).join(' | '), r.plateRaw, r.chassisRaw, r.ownerNameRaw, r.idRaw, r.registeredOn, r.office]),
  );

  // Summary: counts only (no personal data), safe to read anywhere.
  const tally = (list, field) => {
    const m = new Map();
    for (const r of list) for (const x of r[field]) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const onlyReason = new Map();
  for (const r of rejected) if (r.reasons.length === 1) onlyReason.set(r.reasons[0], (onlyReason.get(r.reasons[0]) ?? 0) + 1);
  const conflicts = [...owners.values()].filter((o) => o.names.size > 1).length;
  const lines = [
    `# Old system's vehicles — cleaning summary`,
    ``,
    `Source: ${path.basename(input)} — ${records.length} rows. Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    ``,
    `| | Count |`,
    `|---|---|`,
    `| Vehicles ready to import (vehicles-clean.csv) | ${kept.length} |`,
    `| Their owners, one per identity number (owners-clean.csv) | ${owners.size} |`,
    `| …of whom with more than one spelling of their name | ${conflicts} |`,
    `| Rows not imported (vehicles-rejected.csv) | ${rejected.length} |`,
    `| Repeated plates that are ONE vehicle registered more than once (same chassis and owner on every row), all dropped by the client's rule | ${sameVehicleGroups} vehicles (${sameVehicleRows} rows) |`,
    ``,
    `## Why rows were not imported (a row can have several reasons)`,
    ``,
    `| Reason | Rows | Only this reason |`,
    `|---|---|---|`,
    ...tally(rejected, 'reasons').map(([k, n]) => `| ${REASONS[k]} (${k}) | ${n} | ${onlyReason.get(k) ?? 0} |`),
    ``,
    `## Imported with a warning`,
    ``,
    `| Warning | Rows |`,
    `|---|---|`,
    ...tally(kept, 'warnings').map(([k, n]) => `| ${WARNINGS[k]} (${k}) | ${n} |`),
    ``,
    `## Imported vehicles`,
    ``,
    `| | Count |`,
    `|---|---|`,
    `| National number / administrative number owners | ${kept.filter((r) => r.identityType === 'NATIONAL_ID').length} / ${kept.filter((r) => r.identityType === 'ADMINISTRATIVE_ID').length} |`,
    `| Standard / non-standard / no chassis number | ${kept.filter((r) => r.chassis && !r.chassisNonStandard).length} / ${kept.filter((r) => r.chassisNonStandard).length} / ${kept.filter((r) => !r.chassis).length} |`,
    `| Petrol / diesel / unknown fuel | ${kept.filter((r) => r.fuel === 'PETROL').length} / ${kept.filter((r) => r.fuel === 'DIESEL').length} / ${kept.filter((r) => !r.fuel).length} |`,
    `| Marked stolen in the old system | ${kept.filter((r) => r.stolen === 'نعم').length} |`,
    `| Make recognised / kept as written | ${kept.filter((r) => r.make && Object.keys(MAKES).includes(r.make)).length} / ${kept.filter((r) => r.make && !Object.keys(MAKES).includes(r.make)).length} |`,
    `| Registered between | ${kept.map((r) => r.registeredOn).filter(Boolean).sort()[0]} and ${kept.map((r) => r.registeredOn).filter(Boolean).sort().at(-1)} |`,
    ``,
    `Not copied from the export: the notes column (it holds health conditions and nationalities), phone and coordinates (empty), «current_name».`,
  ];
  fs.writeFileSync(path.join(outDir, 'summary.md'), lines.join('\n') + '\n', 'utf8');
  console.log(lines.join('\n'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
