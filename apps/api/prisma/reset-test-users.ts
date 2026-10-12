// Dev only: put the six seeded test accounts back to a known state.
//
//   pnpm reset:test-users
//
// The seed never touches an existing user (upsert with an empty update), so a
// test account whose password was changed, locked out or deactivated stays
// that way. This resets exactly those six accounts to the seed password with
// "must change password" on, the lockout cleared, the account active and every
// open session revoked. It never creates a user and never touches anyone else.
//
// It REFUSES to run when NODE_ENV is production or when DATABASE_URL does not
// point at this machine, so it cannot be aimed at a real database by accident.
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { devScriptRefusal } from '../src/common/utils/local-database';

// Same accounts and password as seed.ts (its `testUsers`).
const TEST_USERNAMES = [
  'employee1',
  'supervisor1',
  'registration1',
  'regsupervisor1',
  'admin1',
  'admin2',
  'sysadmin1',
];
const TEST_PASSWORD = 'ChangeMe123!';

async function main() {
  // Constructing the client loads apps/api/.env into process.env, so the
  // checks run on the values the client will actually use.
  const prisma = new PrismaClient();
  try {
    const reason = devScriptRefusal(process.env);
    if (reason) {
      console.error(`Refusing to reset test users: ${reason}`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await argon2.hash(TEST_PASSWORD);
    for (const username of TEST_USERNAMES) {
      const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) {
        console.warn(`  skipped ${username}: not in the database (run the seed first).`);
        continue;
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
            isActive: true,
          },
        }),
        prisma.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      console.log(`  reset ${username}`);
    }
    console.log(`Done. Password is "${TEST_PASSWORD}" and must be changed at first login.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
