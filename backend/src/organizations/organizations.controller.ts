import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { actorFrom } from '../audit/actor';

@Controller('api/v1/organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get('me')
  async getCurrentOrganization(@Request() req: any) {
    return this.organizationsService.findById(req.user.organizationId);
  }

  @Patch('me')
  @RequirePermissions('organization:manage')
  async updateCurrentOrganization(
    @Request() req: any,
    @Body('name') name: string,
  ) {
    return this.organizationsService.update(
      req.user.organizationId,
      { name },
      actorFrom(req),
    );
  }
}
