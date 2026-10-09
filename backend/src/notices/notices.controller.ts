import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NoticesService } from './notices.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { actorFrom } from '../audit/actor';

@Controller('api/v1/notices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NoticesController {
  constructor(private noticesService: NoticesService) {}

  @Post()
  @RequirePermissions('notice:manage')
  async create(
    @Request() req: any,
    @Body('language') language: string,
    @Body('content') content: string,
    @Body('effectiveFrom') effectiveFrom: string,
  ) {
    return this.noticesService.create(
      req.user.organizationId,
      {
        language,
        content,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
      },
      actorFrom(req),
    );
  }

  @Get()
  @RequirePermissions('notice:manage')
  async findAll(@Request() req: any) {
    return this.noticesService.findAll(req.user.organizationId);
  }

  // Declared before ':id' so "current" is not captured as an id
  @Get('current')
  @RequirePermissions('notice:manage')
  async findCurrent(@Request() req: any, @Query('language') language: string) {
    return this.noticesService.findCurrent(
      req.user.organizationId,
      language || 'en',
    );
  }

  @Get(':id')
  @RequirePermissions('notice:manage')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.noticesService.findOne(req.user.organizationId, id);
  }
}
