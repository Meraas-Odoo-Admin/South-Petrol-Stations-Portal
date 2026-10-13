import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createMunicipality, deleteMunicipalities } from './support/municipality-fixtures';

// UX round: no list is unbounded. The municipality page's tabs, the station
// and office lists, the report tables and the notification bell all answer
// one page and the total, with search / filters / sort done on the server.
describe('Pagination and the bell (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now().toString(36);
  const password = 'BoundaryTest123!';
  const settingKey = `e2e.ux.${runId}`;
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const stationIds: string[] = [];
  const officeIds: string[] = [];
  const tokens = new Map<string, string>();
  let municipalityId: string;
  let otherMunicipalityId: string;
  let companyA: string;
  let companyB: string;
  const STATIONS = 30;
  const OFFICES = 3;

  async function makeUser(
    key: string,
    permissions: string[],
    scope: { stationIds?: string[]; municipalityIds?: string[]; unrestricted?: boolean } = {},
  ) {
    const role = await prisma.role.create({
      data: { name: `e2e_ux_${key}_${runId}`, kind: null, unrestrictedStationAccess: scope.unrestricted ?? false },
    });
    roleIds.push(role.id);
    for (const permissionKey of permissions) {
      const p = await prisma.permission.upsert({ where: { key: permissionKey }, create: { key: permissionKey }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    const user = await prisma.user.create({
      data: { username: `e2e_ux_${key}_${runId}`, passwordHash: await argon2.hash(password), fullName: `UX ${key} ${runId}` },
    });
    userIds.push(user.id);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    for (const stationId of scope.stationIds ?? []) {
      await prisma.userStationScope.create({ data: { userId: user.id, stationId } });
    }
    for (const id of scope.municipalityIds ?? []) {
      await prisma.userMunicipalityScope.create({ data: { userId: user.id, municipalityId: id } });
    }
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ username: `e2e_ux_${key}_${runId}`, password }).expect(200);
    tokens.set(key, res.body.accessToken);
    return user.id;
  }

  const get = (key: string, path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${tokens.get(key)}`);
  const send = (method: 'post' | 'patch', key: string, path: string, body: object = {}) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${tokens.get(key)}`).send(body);

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    municipalityId = (await createMunicipality(prisma, `E2E UX Municipality ${runId}`)).id;
    otherMunicipalityId = (await createMunicipality(prisma, `E2E UX Other ${runId}`)).id;
    companyA = (await prisma.company.create({ data: { name: `E2E UX Co A ${runId}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `E2E UX Co B ${runId}` } })).id;

    for (let i = 1; i <= STATIONS; i++) {
      const s = await prisma.station.create({
        data: {
          internalCode: `UXP-${runId}-${String(i).padStart(3, '0')}`,
          stationNumber: String(i),
          // The first 12 carry a marker the search test looks for.
          name: i <= 12 ? `UX محطة ألفا ${i}` : `UX محطة بيتا ${i}`,
          companyId: i % 2 === 0 ? companyA : companyB,
          municipalityId,
          locality: i <= 5 ? 'حي الأمل' : 'حي النصر',
          // Two archived stations: they leave the default list.
          archivedAt: i > STATIONS - 2 ? new Date() : null,
        },
      });
      stationIds.push(s.id);
    }
    for (let i = 1; i <= OFFICES; i++) {
      const o = await prisma.registrationStation.create({
        data: { internalCode: `UXR-${runId}-${i}`, name: `UX مكتب ${i}`, municipalityId, address: `شارع ${i}`, locality: 'حي الأمل' },
      });
      officeIds.push(o.id);
    }
    // A station in another municipality never shows in this one's list.
    stationIds.push(
      (
        await prisma.station.create({
          data: { internalCode: `UXP-${runId}-OUT`, stationNumber: '999', name: 'UX خارج', companyId: companyA, municipalityId: otherMunicipalityId },
        })
      ).id,
    );

    await makeUser('admin', ['municipalities:manage', 'municipalities:read', 'reports:municipality', 'stations:read', 'stations:view_preparing'], { unrestricted: true });
    // People of the municipality: three station supervisors.
    await makeUser('sup1', ['stations:read'], { stationIds: [stationIds[0]!] });
    await makeUser('sup2', ['stations:read'], { stationIds: [stationIds[1]!] });
    await makeUser('scoped', ['stations:read', 'notifications:read'], { stationIds: [stationIds[0]!, stationIds[1]!, stationIds[2]!] });
    await makeUser('settings', ['settings:manage']);
    await makeUser('watcher', ['notifications:read', 'notifications:system_events']);
    await makeUser('usersAdmin', ['users:manage', 'companies:read', 'registration_reports:view'], { unrestricted: true });
    // Three people at the first office, for the office's employee list.
    for (const id of [userIds[1]!, userIds[2]!, userIds[3]!]) {
      await prisma.userRegistrationStationScope.create({ data: { userId: id, registrationStationId: officeIds[0]! } });
    }
  }, 120_000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { entityType: 'SystemSetting', entityId: settingKey } });
    await prisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: settingKey }] } });
    await prisma.systemSetting.deleteMany({ where: { key: settingKey } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRegistrationStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userStationScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userMunicipalityScope.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.station.deleteMany({ where: { id: { in: stationIds } } });
    await prisma.registrationStation.deleteMany({ where: { id: { in: officeIds } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyA, companyB] } } });
    await deleteMunicipalities(prisma, [municipalityId, otherMunicipalityId]);
    await app.close();
  });

  // ── the municipality page's lists ─────────────────────────────────────

  describe('places (المحطات والمكاتب)', () => {
    const live = STATIONS - 2 + OFFICES; // 28 stations + 3 offices

    it('returns one page and the total, never the whole list', async () => {
      const first = await get('admin', `/municipalities/${municipalityId}/places?take=25`).expect(200);
      expect(first.body).toMatchObject({ total: live, skip: 0, take: 25 });
      expect(first.body.items).toHaveLength(25);

      const second = await get('admin', `/municipalities/${municipalityId}/places?skip=25&take=25`).expect(200);
      expect(second.body.total).toBe(live);
      expect(second.body.items).toHaveLength(live - 25);

      const ids = [...first.body.items, ...second.body.items].map((r: { id: string }) => r.id);
      expect(new Set(ids).size).toBe(live); // no row twice, none missing
    });

    it('the default page size is 25 and 100 is the ceiling', async () => {
      const res = await get('admin', `/municipalities/${municipalityId}/places`).expect(200);
      expect(res.body.take).toBe(25);
      expect(res.body.items.length).toBeLessThanOrEqual(25);
      await get('admin', `/municipalities/${municipalityId}/places?take=101`).expect(400);
      await get('admin', `/municipalities/${municipalityId}/places?take=0`).expect(400);
      await get('admin', `/municipalities/${municipalityId}/places?skip=-1`).expect(400);
    });

    it('filters and paging work together: search, type, company, status', async () => {
      // Search narrows the total, and pages of it add up to that total.
      const search = encodeURIComponent('ألفا');
      const p1 = await get('admin', `/municipalities/${municipalityId}/places?q=${search}&take=5`).expect(200);
      const p2 = await get('admin', `/municipalities/${municipalityId}/places?q=${search}&take=5&skip=5`).expect(200);
      const p3 = await get('admin', `/municipalities/${municipalityId}/places?q=${search}&take=5&skip=10`).expect(200);
      expect(p1.body.total).toBe(12);
      expect([p1.body.items.length, p2.body.items.length, p3.body.items.length]).toEqual([5, 5, 2]);

      // The type filter.
      const offices = await get('admin', `/municipalities/${municipalityId}/places?kind=OFFICE`).expect(200);
      expect(offices.body.total).toBe(OFFICES);
      expect(offices.body.items.every((r: { kind: string }) => r.kind === 'OFFICE')).toBe(true);
      const stations = await get('admin', `/municipalities/${municipalityId}/places?kind=STATION&take=100`).expect(200);
      expect(stations.body.total).toBe(STATIONS - 2);

      // A company only ever matches stations.
      const byCompany = await get('admin', `/municipalities/${municipalityId}/places?companyId=${companyA}&take=100`).expect(200);
      expect(byCompany.body.items.every((r: { kind: string; company: string }) => r.kind === 'STATION' && r.company.includes('Co A'))).toBe(true);

      // Archived ones are a status, not part of the default list.
      const archived = await get('admin', `/municipalities/${municipalityId}/places?status=ARCHIVED`).expect(200);
      expect(archived.body.total).toBe(2);

      // Locality (stations and offices share «حي الأمل»).
      const locality = await get('admin', `/municipalities/${municipalityId}/places?locality=${encodeURIComponent('الأمل')}`).expect(200);
      expect(locality.body.total).toBe(5 + OFFICES);
    });

    it('sorts on the server and a second page continues the same order', async () => {
      const asc = await get('admin', `/municipalities/${municipalityId}/places?sort=code&dir=asc&take=100`).expect(200);
      const codes: string[] = asc.body.items.map((r: { code: string }) => r.code);
      expect([...codes].sort()).toEqual(codes);
      const desc = await get('admin', `/municipalities/${municipalityId}/places?sort=code&dir=desc&take=10`).expect(200);
      expect(desc.body.items[0].code).toBe([...codes].sort().at(-1));
      const page2 = await get('admin', `/municipalities/${municipalityId}/places?sort=code&dir=asc&take=10&skip=10`).expect(200);
      expect(page2.body.items.map((r: { code: string }) => r.code)).toEqual(codes.slice(10, 20));
    });

    it('is not available to someone without the municipality permission', async () => {
      await get('scoped', `/municipalities/${municipalityId}/places`).expect(403);
    });
  });

  describe('people (الأشخاص)', () => {
    it('is paged, searched and filtered by job and status', async () => {
      const all = await get('admin', `/municipalities/${municipalityId}/people?take=2`).expect(200);
      expect(all.body.take).toBe(2);
      expect(all.body.items.length).toBeLessThanOrEqual(2);
      expect(all.body.total).toBeGreaterThanOrEqual(3);

      const search = await get('admin', `/municipalities/${municipalityId}/people?q=${encodeURIComponent(`sup1_${runId}`)}`).expect(200);
      expect(search.body.total).toBe(1);

      const jobs = await get('admin', `/municipalities/${municipalityId}/overview`).expect(200);
      expect(jobs.body.counts.stations).toBe(STATIONS - 2);
      expect(jobs.body.counts.offices).toBe(OFFICES);
      expect(jobs.body.people.byJob.length).toBeGreaterThan(0);

      await prisma.user.update({ where: { id: userIds[1]! }, data: { isActive: false } });
      const off = await get('admin', `/municipalities/${municipalityId}/people?status=deactivated`).expect(200);
      expect(off.body.items.map((p: { id: string }) => p.id)).toContain(userIds[1]!);
      await prisma.user.update({ where: { id: userIds[1]! }, data: { isActive: true } });
    });
  });

  describe('activity (سجل النشاط)', () => {
    it('is paged newest first with a total', async () => {
      for (let i = 0; i < 4; i++) {
        await prisma.auditLog.create({
          data: { userId: userIds[0]!, action: 'UPDATE', entityType: 'Station', entityId: stationIds[0]!, newValue: { n: i } },
        });
      }
      const p1 = await get('admin', `/municipalities/${municipalityId}/activity?take=3`).expect(200);
      expect(p1.body.total).toBeGreaterThanOrEqual(4);
      expect(p1.body.items).toHaveLength(3);
      const p2 = await get('admin', `/municipalities/${municipalityId}/activity?take=3&skip=3`).expect(200);
      const times = [...p1.body.items, ...p2.body.items].map((r: { createdAt: string }) => new Date(r.createdAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });
  });

  // ── people are paged, never capped ───────────────────────────────────

  describe('lists of people', () => {
    it('GET /users is a page with the total, searched and filtered by the server', async () => {
      const page = await get('usersAdmin', '/users?take=2').expect(200);
      expect(page.body).toMatchObject({ skip: 0, take: 2 });
      expect(page.body.items).toHaveLength(2);
      expect(page.body.total).toBeGreaterThanOrEqual(6);
      const next = await get('usersAdmin', '/users?take=2&skip=2').expect(200);
      const ids = [...page.body.items, ...next.body.items].map((u: { id: string }) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
      const found = await get('usersAdmin', `/users?q=${encodeURIComponent(`e2e_ux_sup1_${runId}`)}`).expect(200);
      expect(found.body.total).toBe(1);
      await get('usersAdmin', '/users?take=101').expect(400);
    });

    it("an office's employees are a page with the total", async () => {
      const res = await get('usersAdmin', `/reports/registration/offices/${officeIds[0]!}/employees?take=2`).expect(200);
      expect(res.body).toMatchObject({ total: 3, skip: 0, take: 2 });
      expect(res.body.employees).toHaveLength(2);
      const rest = await get('usersAdmin', `/reports/registration/offices/${officeIds[0]!}/employees?take=2&skip=2`).expect(200);
      expect(rest.body.employees).toHaveLength(1);
      await get('usersAdmin', `/reports/registration/offices/${officeIds[0]!}/employees?take=500`).expect(400);
    });
  });

  describe('lookup lists', () => {
    it('are capped, and take q to search', async () => {
      const all = await get('usersAdmin', '/companies').expect(200);
      expect(all.body.length).toBeLessThanOrEqual(200);
      const found = await get('usersAdmin', `/companies?q=${encodeURIComponent(`Co A ${runId}`)}`).expect(200);
      expect(found.body.map((c: { name: string }) => c.name)).toEqual([`E2E UX Co A ${runId}`]);
    });
  });

  // ── the other lists ───────────────────────────────────────────────────

  describe('stations and offices lists', () => {
    it('/stations answers one page with the total when asked, scoped to the caller', async () => {
      const page = await get('scoped', '/stations?take=2').expect(200);
      expect(page.body).toMatchObject({ total: 3, skip: 0, take: 2 });
      expect(page.body.items).toHaveLength(2);
      const rest = await get('scoped', '/stations?take=2&skip=2').expect(200);
      expect(rest.body.items).toHaveLength(1);
      // Never anything outside their scope.
      const ids = [...page.body.items, ...rest.body.items].map((s: { id: string }) => s.id);
      expect(ids.sort()).toEqual([stationIds[0]!, stationIds[1]!, stationIds[2]!].sort());
    });

    it('without paging it is the picker list (an array), capped', async () => {
      const res = await get('scoped', '/stations').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeLessThanOrEqual(200);
    });

    it('the activity of a station is paged', async () => {
      const res = await get('scoped', `/stations/${stationIds[0]!}/activity?take=2`).expect(200);
      expect(res.body.take).toBe(2);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      expect(typeof res.body.total).toBe('number');
    });
  });

  describe('report tables', () => {
    it('a table is read one page at a time, sorted by the server, with the total', async () => {
      const first = await get('admin', `/ops-reports/municipality?municipalityId=${municipalityId}`).expect(200);
      const tables: Array<{ id: string; rows: unknown[]; total: number; take: number; columns: Array<{ key: string }> }> = first.body.tables;
      expect(tables.length).toBeGreaterThan(1);
      for (const t of tables) {
        expect(t.rows.length).toBeLessThanOrEqual(25);
        expect(t.total).toBeGreaterThanOrEqual(t.rows.length);
      }
      const big = tables.find((t) => t.total > 25);
      if (!big) return; // a report with every table short is still correct
      const sortKey = big.columns[0]!.key;
      const page = await get(
        'admin',
        `/ops-reports/municipality?municipalityId=${municipalityId}&table=${big.id}&skip=25&take=25&sort=${sortKey}&dir=asc`,
      ).expect(200);
      expect(page.body.tables).toHaveLength(1);
      expect(page.body.tables[0].total).toBe(big.total);
      expect(page.body.tables[0].skip).toBe(25);
      expect(page.body.tables[0].rows.length).toBe(Math.min(25, big.total - 25));
    });

    it('the export still carries every row', async () => {
      const first = await get('admin', `/ops-reports/municipality?municipalityId=${municipalityId}`).expect(200);
      const big = first.body.tables.find((t: { total: number }) => t.total > 25) ?? first.body.tables[0];
      const csv = await get('admin', `/ops-reports/municipality/export?municipalityId=${municipalityId}&table=${big.id}`).expect(200);
      const lines = String(csv.text).split('\r\n').filter(Boolean);
      expect(lines.length - 1).toBe(big.total); // header + every row
    });
  });

  // ── the bell ──────────────────────────────────────────────────────────

  describe('notifications read as sentences, and repeats collapse', () => {
    const RAW = /←|→|\btrue\b|\bfalse\b|e2e\.ux|[a-z]+\.[a-z_]+|\d+:\s/i;

    it('a setting change reaches the bell as one plain Arabic sentence, never a key or an arrow', async () => {
      await send('post', 'settings', '/system-settings', { key: settingKey, value: '1', description: 'e2e' }).expect(201);
      await send('patch', 'settings', `/system-settings/${settingKey}`, { value: '2' }).expect(200);

      const bell = await get('watcher', '/notifications?limit=30').expect(200);
      const mine = bell.body.items.filter((n: { title: string; body: string }) => n.body.includes('أحد إعدادات المنظومة'));
      expect(mine.length).toBeGreaterThan(0);
      for (const n of mine) {
        expect(`${n.title} ${n.body}`).not.toMatch(RAW);
      }
    });

    it('saving the same value again notifies nobody', async () => {
      const before = await prisma.notification.count({ where: { entityType: 'SystemSetting', entityId: settingKey } });
      await send('patch', 'settings', `/system-settings/${settingKey}`, { value: '2' }).expect(200);
      expect(await prisma.notification.count({ where: { entityType: 'SystemSetting', entityId: settingKey } })).toBe(before);
    });

    it('the same event, flipped back and forth, is one row per distinct sentence - not one per save', async () => {
      for (let i = 0; i < 6; i++) {
        await send('patch', 'settings', `/system-settings/${settingKey}`, { value: i % 2 === 0 ? '3' : '2' }).expect(200);
      }
      const rows = await prisma.notification.findMany({
        where: { userId: userIds[5]!, entityType: 'SystemSetting', entityId: settingKey, readAt: null },
      });
      const distinct = new Set(rows.map((r) => `${r.title}|${r.body}`));
      expect(rows.length).toBe(distinct.size); // no identical unread copies
      expect(rows.length).toBeLessThanOrEqual(3);

      const bell = await get('watcher', '/notifications?limit=30').expect(200);
      const keys = bell.body.items.map((n: { title: string; body: string; readAt: string | null }) => `${n.title}|${n.body}|${n.readAt ? 'r' : 'u'}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('«تحديد الكل كمقروء» still clears the badge', async () => {
      await send('post', 'watcher', '/notifications/read-all').expect(201);
      const bell = await get('watcher', '/notifications').expect(200);
      expect(bell.body.unreadCount).toBe(0);
    });
  });
});
