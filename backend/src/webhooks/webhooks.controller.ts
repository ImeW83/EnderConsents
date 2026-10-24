import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type {
  CreateWebhookInput,
  UpdateWebhookInput,
} from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { actorFrom } from '../audit/actor';

@Controller('api/v1/webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Post()
  @RequirePermissions('webhook:manage')
  async create(@Request() req: any, @Body() body: CreateWebhookInput) {
    return this.webhooksService.create(req.user.organizationId, actorFrom(req), {
      url: body.url,
      events: body.events,
      description: body.description,
    });
  }

  @Get()
  @RequirePermissions('webhook:manage')
  async findAll(@Request() req: any) {
    return this.webhooksService.findAll(req.user.organizationId);
  }

  @Get(':id')
  @RequirePermissions('webhook:manage')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.findOne(req.user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('webhook:manage')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateWebhookInput,
  ) {
    return this.webhooksService.update(
      req.user.organizationId,
      actorFrom(req),
      id,
      {
        url: body.url,
        events: body.events,
        description: body.description,
        isActive: body.isActive,
      },
    );
  }

  @Delete(':id')
  @RequirePermissions('webhook:manage')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.remove(
      req.user.organizationId,
      actorFrom(req),
      id,
    );
  }

  @Post(':id/rotate-secret')
  @RequirePermissions('webhook:manage')
  async rotateSecret(
    @Request() req: any,
    @Param('id') id: string,
    @Body('gracePeriodHours') gracePeriodHours?: number,
  ) {
    return this.webhooksService.rotateSecret(
      req.user.organizationId,
      actorFrom(req),
      id,
      gracePeriodHours,
    );
  }

  @Post(':id/test')
  @RequirePermissions('webhook:manage')
  async sendTest(@Request() req: any, @Param('id') id: string) {
    return this.webhooksService.sendTest(req.user.organizationId, id);
  }

  @Get(':id/deliveries')
  @RequirePermissions('webhook:manage')
  async listDeliveries(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: { status?: string; limit?: string; offset?: string },
  ) {
    return this.webhooksService.listDeliveries(
      req.user.organizationId,
      id,
      query,
    );
  }

  @Get(':id/deliveries/:deliveryId')
  @RequirePermissions('webhook:manage')
  async findDelivery(
    @Request() req: any,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.webhooksService.findDelivery(
      req.user.organizationId,
      id,
      deliveryId,
    );
  }

  @Post(':id/deliveries/:deliveryId/redeliver')
  @RequirePermissions('webhook:manage')
  async redeliver(
    @Request() req: any,
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    return this.webhooksService.redeliver(
      req.user.organizationId,
      actorFrom(req),
      id,
      deliveryId,
    );
  }
}
