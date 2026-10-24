import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { actorFrom } from '../audit/actor';

@Controller('api/v1/api-keys')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Post()
  @RequirePermissions('apikey:manage')
  async create(
    @Request() req: any,
    @Body('name') name: string,
    @Body('scopes') scopes: string[],
  ) {
    return this.apiKeysService.create(req.user.organizationId, actorFrom(req), {
      name,
      scopes,
    });
  }

  @Get()
  @RequirePermissions('apikey:manage')
  async findAll(@Request() req: any) {
    return this.apiKeysService.findAll(req.user.organizationId);
  }

  @Delete(':id')
  @RequirePermissions('apikey:manage')
  async revoke(@Request() req: any, @Param('id') id: string) {
    return this.apiKeysService.revoke(
      req.user.organizationId,
      actorFrom(req),
      id,
    );
  }
}
