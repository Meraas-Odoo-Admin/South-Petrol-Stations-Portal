import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateUserDto } from './dto/create-user.dto';

function toSafeUser<T extends { passwordHash: string }>(user: T) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async create(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException('Username is already taken.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        mustChangePassword: true,
      },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      newValue: { username: user.username, fullName: user.fullName },
    });

    return toSafeUser(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: {
        roles: { include: { role: true } },
        stationScope: { include: { station: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return users.map(toSafeUser);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        stationScope: { include: { station: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return toSafeUser(user);
  }

  async assignRole(userId: string, roleId: string, actorId: string) {
    await this.ensureUserExists(userId);
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });

    this.rbac.invalidate(userId);

    await this.audit.log({
      userId: actorId,
      action: 'ASSIGN_ROLE',
      entityType: 'User',
      entityId: userId,
      newValue: { roleId, roleName: role.name },
    });

    return this.findOne(userId);
  }

  async removeRole(userId: string, roleId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });
    this.rbac.invalidate(userId);

    await this.audit.log({
      userId: actorId,
      action: 'REMOVE_ROLE',
      entityType: 'User',
      entityId: userId,
      oldValue: { roleId },
    });

    return this.findOne(userId);
  }

  async addStationScope(userId: string, stationId: string, actorId: string) {
    await this.ensureUserExists(userId);
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) {
      throw new NotFoundException('Station not found.');
    }

    await this.prisma.userStationScope.upsert({
      where: { userId_stationId: { userId, stationId } },
      create: { userId, stationId },
      update: {},
    });

    await this.audit.log({
      userId: actorId,
      action: 'ADD_STATION_SCOPE',
      entityType: 'User',
      entityId: userId,
      newValue: { stationId, internalCode: station.internalCode },
    });

    return this.findOne(userId);
  }

  async removeStationScope(userId: string, stationId: string, actorId: string) {
    await this.ensureUserExists(userId);
    await this.prisma.userStationScope.deleteMany({ where: { userId, stationId } });

    await this.audit.log({
      userId: actorId,
      action: 'REMOVE_STATION_SCOPE',
      entityType: 'User',
      entityId: userId,
      oldValue: { stationId },
    });

    return this.findOne(userId);
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
  }
}
