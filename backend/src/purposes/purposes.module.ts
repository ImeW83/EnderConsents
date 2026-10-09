import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PurposesService } from './purposes.service';
import { PurposesController } from './purposes.controller';

@Module({
  imports: [AuditModule],
  controllers: [PurposesController],
  providers: [PurposesService],
  exports: [PurposesService],
})
export class PurposesModule {}
