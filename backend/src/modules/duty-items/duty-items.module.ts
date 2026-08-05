import { Module } from '@nestjs/common';
import { DutyItemsService } from './duty-items.service';
import { DutyItemsController } from './duty-items.controller';

@Module({
  controllers: [DutyItemsController],
  providers: [DutyItemsService],
  exports: [DutyItemsService],
})
export class DutyItemsModule {}
