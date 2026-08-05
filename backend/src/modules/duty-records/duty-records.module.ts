import { Module } from '@nestjs/common';
import { DutyRecordsService } from './duty-records.service';
import { DutyRecordsController } from './duty-records.controller';
import { DutyItemsModule } from '../duty-items/duty-items.module';
import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [DutyItemsModule, ScheduleModule],
  controllers: [DutyRecordsController],
  providers: [DutyRecordsService],
  exports: [DutyRecordsService],
})
export class DutyRecordsModule {}
