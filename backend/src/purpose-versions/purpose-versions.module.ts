import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PurposeVersionsService } from './purpose-versions.service';
import { PurposeVersionsController } from './purpose-versions.controller';
import { PurposesModule } from '../purposes/purposes.module';

@Module({
  imports: [PurposesModule, AuditModule],
  controllers: [PurposeVersionsController],
  providers: [PurposeVersionsService],
  exports: [PurposeVersionsService],
})
export class PurposeVersionsModule {}
