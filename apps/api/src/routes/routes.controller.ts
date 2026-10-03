import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('routes')
@Controller('routes')
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @RequirePermission('routes:manage')
  @Post()
  create(@Body() dto: CreateRouteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.routes.create(dto, actor.id);
  }

  @RequirePermission('routes:read')
  @Get()
  findAll() {
    return this.routes.findAll();
  }

  @RequirePermission('routes:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.routes.findOne(id);
  }

  @RequirePermission('routes:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRouteDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.routes.update(id, dto, actor.id);
  }
}
