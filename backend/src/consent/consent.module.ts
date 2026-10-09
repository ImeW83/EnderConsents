import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';
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
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
