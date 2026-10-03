import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SecurityAuthoritiesService } from './security-authorities.service';
import { CreateSecurityAuthorityDto } from './dto/create-security-authority.dto';
import { UpdateSecurityAuthorityDto } from './dto/update-security-authority.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('security-authorities')
@Controller('security-authorities')
export class SecurityAuthoritiesController {
  constructor(private readonly authorities: SecurityAuthoritiesService) {}

  @RequirePermission('security_authorities:manage')
  @Post()
  create(@Body() dto: CreateSecurityAuthorityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.authorities.create(dto, actor.id);
  }

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
