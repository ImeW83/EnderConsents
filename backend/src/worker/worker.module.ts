import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ConsentModule } from '../consent/consent.module';
import { DispatcherService } from './dispatcher.service';
import { MaintenanceService } from './maintenance.service';

// Background process: runs separately from the API so a slow customer
// endpoint or a retry storm can never slow down consent capture
@Module({
  imports: [PrismaModule, WebhooksModule, ConsentModule],
  providers: [DispatcherService, MaintenanceService],
})
export class WorkerModule {}
