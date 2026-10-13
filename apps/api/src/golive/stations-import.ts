import type { FuelType, Prisma, PrismaClient, StationStatus } from '@prisma/client';
import { normalizeLibyanMobile } from '@fuel-tracking/shared-types';
import { parseCsv } from './csv';

// Phase 5C: the client's confirmed list of Sabha's petrol stations, loaded
// from a private CSV (data/private/, git-ignored). Idempotent: a station is
// found by (company, station number) - never by number alone - and created or
// brought in line with the CSV, so running it twice changes nothing.

export const SABHA = 'سبها';

const STATUSES: ReadonlySet<string> = new Set([
  'ACTIVE',
  'SUSPENDED_LEGAL',
  'SUSPENDED_COMMITTEE',
  'SUSPENDED_OWNER',
  'NOT_YET_SUPPLIED',
  'UNVERIFIED',
]);

export interface StationRow {
  line: number;
  company: string;
  stationNumber: string;
  name: string;
  locality: string | null;
  status: StationStatus;
  statusNote: string | null;
  ownershipAsWritten: string;
  ownershipType: 'GOVERNMENT' | 'PRIVATE' | null;
  supervisorName: string | null;
  supervisorPhone: string | null;
  operatorName: string | null;
  operatorPhone: string | null;
  fuel: Partial<Record<FuelType, boolean>>;
  checkNote: string | null;
}

export interface ParseResult {
  rows: StationRow[];
  /** Problems that stop the import (a missing company, a repeated station...). */
  errors: string[];
  /** Things worth telling the client, that do not stop it. */
  warnings: string[];
}

const blank = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

function yesNo(value: string | undefined): boolean | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return undefined;
}

export function parseStationRows(csvText: string): ParseResult {
  const records = parseCsv(csvText);
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: StationRow[] = [];
  const seen = new Set<string>();

  records.forEach((rec, index) => {
    const line = index + 2; // the header is line 1
    const company = blank(rec['company']);
    const stationNumber = blank(rec['station_number']);
    const name = blank(rec['name']);
    if (!company || !stationNumber || !name) {
      errors.push(`Line ${line}: company, station_number and name are all required.`);
      return;
    }
    const municipality = blank(rec['municipality']) ?? SABHA;
    if (municipality !== SABHA) {
      errors.push(`Line ${line}: municipality is "${municipality}"; every station in this list belongs to ${SABHA}.`);
      return;
    }
    const key = `${company}\u0000${stationNumber}`;
    if (seen.has(key)) {
      errors.push(`Line ${line}: ${company} / ${stationNumber} appears twice.`);
      return;
    }
    seen.add(key);

    const status = (blank(rec['status']) ?? 'ACTIVE') as StationStatus;
    if (!STATUSES.has(status)) {
      errors.push(`Line ${line}: unknown status "${status}".`);
      return;
    }

    // «خاصة» -> PRIVATE. «مملوكة» is deliberately left empty: it may mean
    // company-owned rather than government, which is a question for the client.
    const ownershipAsWritten = blank(rec['ownership_as_written']) ?? '';
    let ownershipType: StationRow['ownershipType'] = null;
    if (ownershipAsWritten === 'خاصة') ownershipType = 'PRIVATE';
    else if (ownershipAsWritten !== '') {
      warnings.push(
        `Line ${line} (${company} / ${stationNumber}, ${name}): ownership «${ownershipAsWritten}» left empty - client question.`,
      );
    }

    const phone = (raw: string | null, label: string): string | null => {
      if (!raw) return null;
      const normalized = normalizeLibyanMobile(raw);
      if (!normalized) {
        warnings.push(`Line ${line} (${company} / ${stationNumber}): ${label} is not a valid Libyan mobile number; left empty.`);
      }
      return normalized;
    };

    const fuel: StationRow['fuel'] = {};
    const petrol = yesNo(rec['petrol_95']);
    const diesel = yesNo(rec['diesel']);
    const kerosene = yesNo(rec['kerosene']);
    if (petrol !== undefined) fuel.PETROL_95 = petrol;
    if (diesel !== undefined) fuel.DIESEL = diesel;
    if (kerosene !== undefined) fuel.KEROSENE = kerosene;

    rows.push({
      line,
      company,
      stationNumber,
      name,
      locality: blank(rec['locality']),
      status,
      statusNote: blank(rec['status_note']),
      ownershipAsWritten,
      ownershipType,
      supervisorName: blank(rec['supervisor_name']),
      supervisorPhone: phone(blank(rec['supervisor_phone']), 'supervisor phone'),
      operatorName: blank(rec['operator_name']),
      operatorPhone: phone(blank(rec['operator_phone']), 'operator phone'),
      fuel,
      checkNote: blank(rec['check_note']),
    });
  });

  return { rows, errors, warnings };
}

export interface ImportReport {
  created: Array<{ company: string; stationNumber: string; name: string; internalCode: string }>;
  updated: Array<{ company: string; stationNumber: string; name: string; changed: string[] }>;
  unchanged: number;
  /** The CSV's check notes, to be confirmed by the client (imported as written). */
  checkNotes: Array<{ company: string; stationNumber: string; name: string; note: string }>;
  warnings: string[];
}

async function nextInternalCode(prisma: PrismaClient | Prisma.TransactionClient): Promise<string> {
  const count = await prisma.station.count();
  for (let offset = 0; offset < 50; offset++) {
    const candidate = `STN-${String(count + 1 + offset).padStart(6, '0')}`;
    if (!(await prisma.station.findUnique({ where: { internalCode: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique station internal code.');
}

// Writes the parsed rows. `apply: false` computes the same report without
// writing anything. The whole run is one transaction: a failure part-way
// leaves the database as it was.
export async function importStations(
  prisma: PrismaClient,
  rows: StationRow[],
  options: { apply: boolean; warnings?: string[]; clearBlanks?: boolean } = { apply: true },
): Promise<ImportReport> {
  const report: ImportReport = {
    created: [],
    updated: [],
    unchanged: 0,
    checkNotes: [],
    warnings: [...(options.warnings ?? [])],
  };

  const municipality = await prisma.municipality.findUnique({ where: { name: SABHA }, select: { id: true } });
  if (!municipality) {
    throw new Error(`The municipality ${SABHA} does not exist yet. Create it first (bootstrap-prod.ts does).`);
  }

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        let company = await tx.company.findUnique({ where: { name: row.company } });
        if (!company) {
          if (!options.apply) {
            report.created.push({ company: row.company, stationNumber: row.stationNumber, name: row.name, internalCode: '(new)' });
            if (row.checkNote) report.checkNotes.push({ company: row.company, stationNumber: row.stationNumber, name: row.name, note: row.checkNote });
            continue;
          }
          company = await tx.company.create({ data: { name: row.company } });
        }

        const existing = await tx.station.findUnique({
          where: { companyId_stationNumber: { companyId: company.id, stationNumber: row.stationNumber } },
          include: { fuelAvailability: true },
        });

        // The CSV is the source for what it carries. A blank cell never wipes a
        // value that is already there (a manager may have filled it in since);
        // only the status and, for any written ownership other than «خاصة»
        // (i.e. «مملوكة»), the ownership are always written.
        const data: {
          name: string;
          municipalityId: string;
          status: StationStatus;
          statusNote: string | null;
          operatorSameAsSupervisor: boolean;
          locality?: string | null;
          ownershipType?: 'GOVERNMENT' | 'PRIVATE' | null;
          supervisorName?: string | null;
          supervisorPhone?: string | null;
          operatorName?: string | null;
          operatorPhone?: string | null;
        } = {
          name: row.name,
          municipalityId: municipality.id,
          status: row.status,
          // A note only means something while the station is not ACTIVE.
          statusNote: row.status === 'ACTIVE' ? null : row.statusNote,
          // The client's list does not say "the operator is the supervisor".
          operatorSameAsSupervisor: false,
        };
        // clearBlanks (--overwrite-blanks): the file is the whole truth, so a
        // blank cell empties the field too. Off by default.
        const carry = <T>(value: T | null): T | null | undefined => (value !== null ? value : options.clearBlanks ? null : undefined);
        const assign = <K extends 'locality' | 'supervisorName' | 'supervisorPhone' | 'operatorName' | 'operatorPhone'>(
          key: K,
          value: string | null,
        ) => {
          const v = carry(value);
          if (v !== undefined) data[key] = v;
        };
        assign('locality', row.locality);
        assign('supervisorName', row.supervisorName);
        assign('supervisorPhone', row.supervisorPhone);
        assign('operatorName', row.operatorName);
        assign('operatorPhone', row.operatorPhone);
        if (row.ownershipAsWritten !== '' || options.clearBlanks) data.ownershipType = row.ownershipType;

        if (row.checkNote) {
          report.checkNotes.push({ company: row.company, stationNumber: row.stationNumber, name: row.name, note: row.checkNote });
        }

        if (!existing) {
          const internalCode = options.apply ? await nextInternalCode(tx) : '(new)';
          if (options.apply) {
            await tx.station.create({
              data: {
                ...data,
                internalCode,
                stationNumber: row.stationNumber,
                companyId: company.id,
                fuelAvailability: {
                  create: (Object.entries(row.fuel) as Array<[FuelType, boolean]>).map(([fuelType, isAvailable]) => ({
                    fuelType,
                    isAvailable,
                  })),
                },
              },
            });
          }
          report.created.push({ company: row.company, stationNumber: row.stationNumber, name: row.name, internalCode });
          continue;
        }

        const changed: string[] = [];
        for (const [field, value] of Object.entries(data)) {
          if ((existing as Record<string, unknown>)[field] !== value) changed.push(field);
        }
        const fuelChanges: Array<[FuelType, boolean]> = [];
        for (const [fuelType, isAvailable] of Object.entries(row.fuel) as Array<[FuelType, boolean]>) {
          const current = existing.fuelAvailability.find((f) => f.fuelType === fuelType);
          if (!current || current.isAvailable !== isAvailable) {
            fuelChanges.push([fuelType, isAvailable]);
            changed.push(`fuel:${fuelType}`);
          }
        }
        if (changed.length === 0) {
          report.unchanged++;
          continue;
        }
        if (options.apply) {
          await tx.station.update({ where: { id: existing.id }, data });
          for (const [fuelType, isAvailable] of fuelChanges) {
            await tx.stationFuelAvailability.upsert({
              where: { stationId_fuelType: { stationId: existing.id, fuelType } },
              create: { stationId: existing.id, fuelType, isAvailable },
              update: { isAvailable },
            });
          }
        }
        report.updated.push({ company: row.company, stationNumber: row.stationNumber, name: row.name, changed });
      }

      if (options.apply && (report.created.length > 0 || report.updated.length > 0)) {
        await tx.auditLog.create({
          data: {
            action: 'IMPORT_STATIONS',
            entityType: 'Station',
            entityId: 'bulk',
            newValue: { created: report.created.length, updated: report.updated.length, source: 'stations:import' },
          },
        });
      }
    },
    { timeout: 120_000 },
  );

  return report;
}
