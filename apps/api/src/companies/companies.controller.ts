import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.interface';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @RequirePermission('companies:manage')
  @Post()
  create(@Body() dto: CreateCompanyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.companies.create(dto, actor.id);
  }

  @RequirePermission('companies:read')
  @Get()
  findAll() {
    return this.companies.findAll();
  }

  @RequirePermission('companies:read')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companies.findOne(id);
  }

  @RequirePermission('companies:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.companies.update(id, dto, actor.id);
  }
}
