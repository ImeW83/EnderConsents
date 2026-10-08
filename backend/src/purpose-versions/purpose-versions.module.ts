import { Module } from '@nestjs/common';
import { PurposeVersionsService } from './purpose-versions.service';
import { PurposeVersionsController } from './purpose-versions.controller';
import { PurposesModule } from '../purposes/purposes.module';

@Module({
  imports: [PurposesModule],
  controllers: [PurposeVersionsController],
  providers: [PurposeVersionsService],
  exports: [PurposeVersionsService],
})
export class PurposeVersionsModule {}
