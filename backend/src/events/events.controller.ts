import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import type { EventsQuery } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireScopes } from '../auth/decorators/scopes.decorator';

@Controller('api/v1/events')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  @RequirePermissions('consent:read')
  async list(@Request() req: any, @Query() query: EventsQuery) {
    return this.eventsService.list(req.user.organizationId, query);
  }
}

@Controller('api/v1/public/events')
@UseGuards(ApiKeyGuard)
export class PublicEventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  @RequireScopes('consent:read')
  async list(@Request() req: any, @Query() query: EventsQuery) {
    return this.eventsService.list(req.apiKey.organizationId, query);
  }
}
