import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OwnersService } from './owners.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { FindOwnersQueryDto } from './dto/find-owners-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('owners')
@Controller('owners')
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}

  @RequirePermission('owners:manage')
  @Post()
  create(@Body() dto: CreateOwnerDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.owners.create(dto, actor.id);
  }

  @RequirePermission('owners:manage')
  @Get()
  findAll(@Query() query: FindOwnersQueryDto) {
    return this.owners.findAll(query);
  }

  @RequirePermission('owners:manage')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.owners.findOne(id);
  }

  @RequirePermission('owners:reveal_identity')
  @Post(':id/reveal-identity')
  revealIdentity(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.owners.revealIdentity(id, actor.id);
  }

  @RequirePermission('owners:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOwnerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.owners.update(id, dto, actor.id);
  }
}
