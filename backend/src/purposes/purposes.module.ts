import { Module } from '@nestjs/common';
import { PurposesService } from './purposes.service';
import { PurposesController } from './purposes.controller';

@Module({
  controllers: [PurposesController],
  providers: [PurposesService],
  exports: [PurposesService],
})
export class PurposesModule {}
