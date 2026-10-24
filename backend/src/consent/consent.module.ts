import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';
import { PublicConsentController } from './public-consent.controller';
import { PublicConsentService } from './public-consent.service';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { SubjectsModule } from '../subjects/subjects.module';
import { PurposesModule } from '../purposes/purposes.module';
import { PurposeVersionsModule } from '../purpose-versions/purpose-versions.module';
import { NoticesModule } from '../notices/notices.module';

@Module({
  imports: [
    SubjectsModule,
    PurposesModule,
    PurposeVersionsModule,
    NoticesModule,
    AuditModule,
    WebhooksModule,
  ],
  controllers: [ConsentController, PublicConsentController],
  providers: [
    ConsentService,
    PublicConsentService,
    ApiKeyGuard,
    IdempotencyInterceptor,
  ],
  exports: [ConsentService],
})
export class ConsentModule {}
