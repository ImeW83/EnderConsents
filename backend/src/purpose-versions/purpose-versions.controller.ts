import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { PurposeVersionsService } from './purpose-versions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/purposes/:purposeId/versions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurposeVersionsController {
  constructor(private purposeVersionsService: PurposeVersionsService) {}

  @Post()
  @RequirePermissions('purpose:manage')
  async create(
    @Request() req: any,
    @Param('purposeId') purposeId: string,
    @Body('name') name: string,
    @Body('description') description: string,
    @Body('legalBasis') legalBasis: string,
    @Body('effectiveFrom') effectiveFrom: string,
  ) {
    return this.purposeVersionsService.create(req.user.organizationId, purposeId, {
      name,
      description,
      legalBasis,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
    });
  }

  @Get()
  @RequirePermissions('purpose:manage')
  async findAll(@Request() req: any, @Param('purposeId') purposeId: string) {
    return this.purposeVersionsService.findAll(req.user.organizationId, purposeId);
  }

  @Get(':id')
  @RequirePermissions('purpose:manage')
  async findOne(
    @Request() req: any,
    @Param('purposeId') purposeId: string,
    @Param('id') id: string,
  ) {
    return this.purposeVersionsService.findOne(req.user.organizationId, purposeId, id);
  }
}
