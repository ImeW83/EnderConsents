import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';
import { PublicConsentController } from './public-consent.controller';
import { PublicConsentService } from './public-consent.service';
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
  ],
  controllers: [ConsentController, PublicConsentController],
  providers: [ConsentService, PublicConsentService, ApiKeyGuard],
  exports: [ConsentService],
})
export class ConsentModule {}
