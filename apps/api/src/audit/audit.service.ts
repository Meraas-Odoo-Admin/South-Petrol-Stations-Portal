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

// Deliberately only ever INSERTs. Per CLAUDE.md rule 6, the audit table is
// insert-only for the app's DB role — this service has no update/delete
// method so nothing in application code can be tempted to add one.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
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
