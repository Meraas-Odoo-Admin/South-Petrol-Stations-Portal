import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId: string | null;
  action: string; // "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | ...
  entityType: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
}

// A Prisma client capable of running auditLog.create — either the ambient
// PrismaService, or the `tx` handed to a `$transaction(async (tx) => ...)`
// callback. Callers doing a mutation + audit row together MUST pass the
// same `tx` to both so a crash between them can't leave one without the
// other (see CLAUDE.md rule 6).
export type AuditCapableClient = PrismaService | Prisma.TransactionClient;

// Deliberately only ever INSERTs. Per CLAUDE.md rule 6, the audit table is
// insert-only for the app's DB role — this service has no update/delete
// method so nothing in application code can be tempted to add one.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, client: AuditCapableClient = this.prisma): Promise<void> {
    await client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.oldValue ?? Prisma.JsonNull,
        newValue: entry.newValue ?? Prisma.JsonNull,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  }
}
