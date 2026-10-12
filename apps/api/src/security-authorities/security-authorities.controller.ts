import { Controller, Get, Param, Patch, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SecurityAuthoritiesService } from './security-authorities.service';
import { UpdateSecurityAuthorityDto } from './dto/update-security-authority.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('security-authorities')
@Controller('security-authorities')
export class SecurityAuthoritiesController {
  constructor(private readonly authorities: SecurityAuthoritiesService) {}

  // Phase 5A: there is no create - a municipality gets its directorate
  // automatically when it is created (MunicipalitiesService.create).

  @RequirePermission('security_authorities:read')
  @Get()
  findAll() {
    return this.authorities.findAll();
  }

  @RequirePermission('security_authorities:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.authorities.findOne(id);
  }

  @RequirePermission('security_authorities:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSecurityAuthorityDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.authorities.update(id, dto, actor.id);
  }
}
