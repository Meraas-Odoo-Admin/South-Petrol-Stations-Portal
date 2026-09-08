import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

// Read-only — Role rows are seeded/fixed, not created through the UI (same
// as Permission). Exists so the admin panel's user-role-assignment picker
// has something to populate itself from; no GET /roles endpoint existed
// anywhere before this.
@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('roles:manage')
  @Get()
  findAll() {
    return this.prisma.role.findMany({
      select: { id: true, name: true, description: true, unrestrictedStationAccess: true },
      orderBy: { name: 'asc' },
    });
  }
}

// Round 12: read-only, same reasoning as RolesController above — Permission
// rows are seeded, not created through the UI. Exists so the new per-user
// direct-permission picker (UsersAdminPage) has something to populate
// itself from; no GET /permissions endpoint existed anywhere before this.
@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermission('roles:manage')
  @Get()
  findAll() {
    return this.prisma.permission.findMany({
      select: { id: true, key: true, description: true },
      orderBy: { key: 'asc' },
    });
  }
}
