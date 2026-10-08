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
import { PurposesService } from './purposes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';

@Controller('api/v1/purposes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurposesController {
  constructor(private purposesService: PurposesService) {}

  @Post()
  @RequirePermissions('purpose:manage')
  async create(
    @Request() req: any,
    @Body('key') key: string,
    @Body('name') name: string,
    @Body('description') description: string,
    @Body('category') category: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.purposesService.create(req.user.organizationId, {
      key,
      name,
      description,
      category,
      isActive,
    });
  }

  @Get()
  @RequirePermissions('purpose:manage')
  async findAll(@Request() req: any) {
    return this.purposesService.findAll(req.user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('purpose:manage')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.purposesService.findOne(req.user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('purpose:manage')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body('key') key: string,
    @Body('name') name: string,
    @Body('description') description: string,
    @Body('category') category: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.purposesService.update(req.user.organizationId, id, {
      key,
      name,
      description,
      category,
      isActive,
    });
  }

  @Delete(':id')
  @RequirePermissions('purpose:manage')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.purposesService.remove(req.user.organizationId, id);
  }
}
