import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Module({
  imports: [AuditModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhookDeliveryService],
  exports: [WebhooksService, WebhookDeliveryService],
})
export class WebhooksModule {}
