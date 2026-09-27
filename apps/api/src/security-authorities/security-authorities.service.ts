import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSecurityAuthorityDto } from './dto/create-security-authority.dto';
import { UpdateSecurityAuthorityDto } from './dto/update-security-authority.dto';

// 409s carry machine-checkable markers (MUNICIPALITY_HAS_AUTHORITY,
// AUTHORITY_OF_LIVE_MUNICIPALITY, SECURITY_AUTHORITY_NAME_TAKEN) that the
// admin screen maps to Arabic.
//
// Settings-managed lookup list for the security authority (الجهة الأمنية)
// overseeing a municipality's petrol stations. Client-confirmed
// (docs/OPEN_ITEMS.md #4, answered): exactly one per municipality — so an
// authority is created FOR a municipality, and a station's authority comes
// from its municipality instead of being picked per station.
@Injectable()
export class SecurityAuthoritiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private readonly include = { municipality: { select: { id: true, name: true, status: true } } } as const;

  // Shared by create/update: the target municipality must exist and must
  // not already have a different authority. The unique index on
  // SecurityAuthority.municipalityId is the real guarantee; this turns a
  // would-be constraint violation into a readable 409.
  private async assertMunicipalityFree(municipalityId: string, exceptAuthorityId?: string) {
    const municipality = await this.prisma.municipality.findUnique({
      where: { id: municipalityId },
      include: { securityAuthority: { select: { id: true } } },
    });
    if (!municipality) {
      throw new NotFoundException('Municipality not found.');
    }
    if (municipality.securityAuthority && municipality.securityAuthority.id !== exceptAuthorityId) {
      throw new ConflictException('MUNICIPALITY_HAS_AUTHORITY');
    }
  }

  async create(dto: CreateSecurityAuthorityDto, actorId: string) {
    const existing = await this.prisma.securityAuthority.findUnique({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('SECURITY_AUTHORITY_NAME_TAKEN');
    }
    await this.assertMunicipalityFree(dto.municipalityId);

    const authority = await this.prisma.securityAuthority.create({
      data: { name: dto.name, municipalityId: dto.municipalityId },
      include: this.include,
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'SecurityAuthority',
      entityId: authority.id,
      newValue: { name: authority.name, municipalityId: authority.municipalityId },
    });

    return authority;
  }

  findAll() {
    return this.prisma.securityAuthority.findMany({ orderBy: { name: 'asc' }, include: this.include });
  }

  async findOne(id: string) {
    const authority = await this.prisma.securityAuthority.findUnique({ where: { id }, include: this.include });
    if (!authority) {
      throw new NotFoundException('Security authority not found.');
    }
    return authority;
  }

  async update(id: string, dto: UpdateSecurityAuthorityDto, actorId: string) {
    const before = await this.findOne(id);

    if (dto.name && dto.name !== before.name) {
      const existing = await this.prisma.securityAuthority.findUnique({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException('SECURITY_AUTHORITY_NAME_TAKEN');
      }
    }

    if (dto.municipalityId && dto.municipalityId !== before.municipalityId) {
      // Moving the authority off a live municipality would leave that
      // municipality's stations with no overseeing authority.
      if (before.municipality?.status === 'LIVE') {
        throw new ConflictException('AUTHORITY_OF_LIVE_MUNICIPALITY');
      }
      await this.assertMunicipalityFree(dto.municipalityId, id);
    }

    const authority = await this.prisma.securityAuthority.update({
      where: { id },
      data: dto,
      include: this.include,
    });

    await this.audit.log({
      userId: actorId,
      action: 'UPDATE',
      entityType: 'SecurityAuthority',
      entityId: authority.id,
      oldValue: { name: before.name, municipalityId: before.municipalityId },
      newValue: { name: authority.name, municipalityId: authority.municipalityId },
    });

    return authority;
  }
}
