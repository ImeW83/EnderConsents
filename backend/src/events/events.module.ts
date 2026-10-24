import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController, PublicEventsController } from './events.controller';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService, ApiKeyGuard],
  exports: [EventsService],
})
export class EventsModule {}
