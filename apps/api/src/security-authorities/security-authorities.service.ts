import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSecurityAuthorityDto } from './dto/create-security-authority.dto';

// Settings-managed lookup list for the station's overseeing security
// authority (الجهة الأمنية المشرفة) — station-card-field-spec item 6. Kept
// deliberately minimal (create + read only, no isActive/update) to match
// SecurityAuthority's own current schema shape — the scope question this
// whole area is pending (docs/OPEN_ITEMS.md #4) isn't resolved by this
// spec, just given a real CRUD surface to be entered through.
@Injectable()
export class SecurityAuthoritiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSecurityAuthorityDto, actorId: string) {
    const existing = await this.prisma.securityAuthority.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A security authority with this name already exists.');
    }

    const authority = await this.prisma.securityAuthority.create({ data: { name: dto.name } });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'SecurityAuthority',
      entityId: authority.id,
      newValue: { name: authority.name },
    });

    return authority;
  }

  findAll() {
    return this.prisma.securityAuthority.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const authority = await this.prisma.securityAuthority.findUnique({ where: { id } });
    if (!authority) {
      throw new NotFoundException('Security authority not found.');
    }
    return authority;
  }
}
