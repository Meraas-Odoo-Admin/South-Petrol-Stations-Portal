import type { Prisma, PrismaClient } from '@prisma/client';

// The audit log is insert-only in the database (migration
// 20261019110000_audit_log_insert_only). Test data is the one thing removed
// from it: inside ONE transaction that sets app.test_data_removal, which
// SET LOCAL ends with the transaction. Used by the test suites' clean-up and
// the development seeds — never by the running application.
export async function deleteAuditRows(prisma: PrismaClient, args: Prisma.AuditLogDeleteManyArgs) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.test_data_removal', 'on', true)`;
    return tx.auditLog.deleteMany(args);
  });
}
