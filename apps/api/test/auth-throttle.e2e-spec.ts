import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { deleteAuditRows } from '../prisma/audit-removal';

// Login is limited per USERNAME (and refresh per refresh token), with a looser
// per-IP ceiling as a backstop. An office behind one gateway shares one IP, so
// a per-IP login limit locked everybody out together; the account lockout
// after 5 wrong passwords is a separate rule and is unchanged.
describe('Auth throttling is per account, not per address (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now().toString(36);
  const prefix = `e2e_thr_${runId}`;
  const password = 'ThrottleTest123!';
  const usernames = Array.from({ length: 8 }, (_, i) => `${prefix}_u${i}`);
  const victim = `${prefix}_victim`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleRef.get(PrismaService);

    const passwordHash = await argon2.hash(password);
    for (const username of [...usernames, victim]) {
      await prisma.user.create({ data: { username, passwordHash, fullName: `Throttle ${username.slice(-6)}` } });
    }
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { username: { startsWith: prefix } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await deleteAuditRows(prisma, { where: { OR: [{ userId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  const login = (username: string, pw: string) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password: pw });

  it('8 different users log in from the same address within a minute and every one succeeds', async () => {
    const statuses: number[] = [];
    for (const username of usernames) {
      statuses.push((await login(username, password)).status);
    }
    expect(statuses).toEqual(Array(8).fill(200));
  });

  it('6 wrong passwords on one username are still blocked, and the right password is refused afterwards', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await login(victim, 'wrong-password-123')).status);
    }
    // The first five are plain refusals (the fifth also locks the account);
    // the sixth is refused as well, by the throttle or the lockout.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect([401, 429]).toContain(statuses[5]);

    const right = await login(victim, password);
    expect([401, 429]).toContain(right.status);
    const row = await prisma.user.findUniqueOrThrow({ where: { username: victim } });
    expect(row.lockedUntil).not.toBeNull();
  });

  it('a different account on the same address is not affected by the blocked one', async () => {
    const other = await login(usernames[0]!, password);
    expect(other.status).toBe(200);
  });
});
