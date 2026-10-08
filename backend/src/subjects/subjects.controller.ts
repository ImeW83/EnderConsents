import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/subjects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubjectsController {
  constructor(private subjectsService: SubjectsService) {}

  @Post()
  @RequirePermissions('subject:write')
  async create(
    @Request() req: any,
    @Body('externalRef') externalRef: string,
    @Body('email') email: string,
    @Body('phone') phone: string,
    @Body('locale') locale: string,
  ) {
    return this.subjectsService.create(req.user.organizationId, {
      externalRef,
      email,
      phone,
      locale,
    });
  }

  @Get()
  @RequirePermissions('subject:read')
  async findAll(@Request() req: any) {
    return this.subjectsService.findAll(req.user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('subject:read')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.subjectsService.findOne(req.user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('subject:write')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body('externalRef') externalRef: string,
    @Body('email') email: string,
    @Body('phone') phone: string,
    @Body('locale') locale: string,
  ) {
    return this.subjectsService.update(req.user.organizationId, id, {
      externalRef,
      email,
      phone,
      locale,
    });
  }

  @Delete(':id')
  @RequirePermissions('subject:write')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.subjectsService.remove(req.user.organizationId, id);
  }
}
