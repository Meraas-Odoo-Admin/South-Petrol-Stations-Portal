import type { Db, Roots } from './removal';
import {
  TEST_OFFICE_CODE_PREFIXES,
  TEST_STATION_CODE_PREFIXES,
  isTestName,
  isTestUsername,
} from './test-markers';
import { SABHA } from './stations-import';

const startsWithAny = (value: string, prefixes: readonly string[]) => prefixes.some((p) => value.startsWith(p));

// What `stations:clean-non-sabha` removes: stations that are not on the
// client's list, and every municipality other than سبها. Users are never roots.
// `keep` holds "company name \u0000 station number" for each CSV row.
export async function nonSabhaRoots(db: Db, keep: ReadonlySet<string>): Promise<{ roots: Roots; problems: string[] }> {
  // Raw on purpose: before the p5c_required_municipality migration a station
  // may still have no municipality, which the generated client now refuses to read.
  const [stations, municipalities] = await Promise.all([
    db.$queryRaw<Array<{ id: string; stationNumber: string; company: string; municipality: string | null }>>`
      SELECT s."id", s."stationNumber", c."name" AS "company", m."name" AS "municipality"
      FROM "Station" s
      JOIN "Company" c ON c."id" = s."companyId"
      LEFT JOIN "Municipality" m ON m."id" = s."municipalityId"`,
    db.municipality.findMany({ select: { id: true, name: true } }),
  ]);
  const problems: string[] = [];
  const stationIds: string[] = [];
  for (const s of stations) {
    const key = `${s.company}\u0000${s.stationNumber}`;
    if (!keep.has(key)) {
      stationIds.push(s.id);
    } else if (s.municipality !== SABHA) {
      problems.push(
        `${s.company} / ${s.stationNumber} is on the client's list but is not in ${SABHA} yet - run stations:import first.`,
      );
    }
  }
  return {
    roots: {
      userIds: [],
      municipalityIds: municipalities.filter((m) => m.name !== SABHA).map((m) => m.id),
      companyIds: [],
      stationIds,
      officeIds: [],
      includeOrphans: false,
      markerRows: false,
    },
    problems,
  };
}

// What `golive:clean` removes: everything the test tooling made.
export async function goliveRoots(db: Db): Promise<Roots> {
  const [users, municipalities, companies, stations, offices] = await Promise.all([
    db.user.findMany({ select: { id: true, username: true } }),
    db.municipality.findMany({ select: { id: true, name: true } }),
    db.company.findMany({ select: { id: true, name: true } }),
    db.station.findMany({ select: { id: true, internalCode: true, name: true } }),
    db.registrationStation.findMany({ select: { id: true, internalCode: true, name: true } }),
  ]);
  return {
    userIds: users.filter((u) => isTestUsername(u.username)).map((u) => u.id),
    // سبها is never a root, whatever its name looks like.
    municipalityIds: municipalities.filter((m) => m.name !== SABHA && isTestName(m.name)).map((m) => m.id),
    companyIds: companies.filter((c) => isTestName(c.name)).map((c) => c.id),
    stationIds: stations
      .filter((s) => startsWithAny(s.internalCode, TEST_STATION_CODE_PREFIXES) || isTestName(s.name))
      .map((s) => s.id),
    officeIds: offices
      .filter((o) => startsWithAny(o.internalCode, TEST_OFFICE_CODE_PREFIXES) || isTestName(o.name))
      .map((o) => o.id),
    includeOrphans: true,
    markerRows: true,
  };
}
