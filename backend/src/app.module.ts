import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { StorageModule } from './storage/storage.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StationsModule } from './modules/stations/stations.module';
import { DistrictsModule } from './modules/districts/districts.module';
import { DutyRecordsModule } from './modules/duty-records/duty-records.module';
import { DutyItemsModule } from './modules/duty-items/duty-items.module';
import { DictionariesModule } from './modules/dictionaries/dictionaries.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ExportsModule } from './modules/exports/exports.module';
import { SystemModule } from './modules/system/system.module';
import { SearchModule } from './modules/search/search.module';
import { LogsModule } from './modules/logs/logs.module';
import { HealthModule } from './modules/health/health.module';
import { ScheduleModule } from './modules/schedule/schedule.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 按 NODE_ENV 加载环境文件。@nestjs/config 规则：数组靠前的文件优先级更高
      // （同名变量前者胜出）。因此把环境专属文件放最前：
      // NODE_ENV=production 时 .env.production 压过 .env/.env.local，避免开发库配置泄漏到生产
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env.local', '.env'],
    }),
    NestScheduleModule.forRoot(),
    StorageModule,
    AuthModule,
    UsersModule,
    StationsModule,
    DistrictsModule,
    DutyRecordsModule,
    DutyItemsModule,
    DictionariesModule,
    DashboardModule,
    ExportsModule,
    SystemModule,
    SearchModule,
    LogsModule,
    HealthModule,
    ScheduleModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
