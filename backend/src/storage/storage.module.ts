import { Inject, Injectable, Module, Global, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { FileStorageService } from './file-storage.service';
import { MongoStorageService } from './mongo-storage.service';
import { MysqlStorageService } from './mysql-storage.service';
import { seedInitialData } from './seed';
import { ScopeService } from '../common/scope/scope.service';

/**
 * 存储模块
 * - 内存模式（默认）：原 StorageService
 * - 文件模式：FileStorageService，落盘 JSON，重启保留数据
 * - Mongo 模式：MongoStorageService，内存缓存 + 异步落库 MongoDB
 * - MySQL 模式：MysqlStorageService，内存缓存 + 异步落库 MySQL
 * 切换：STORAGE_MODE=memory | file | mongo | mysql
 */
function createStorage(
  config: ConfigService,
): StorageService | FileStorageService | MongoStorageService | MysqlStorageService {
  const mode = (config.get<string>('STORAGE_MODE') || 'memory').toLowerCase();
  if (mode === 'file') {
    return new FileStorageService(config);
  }
  if (mode === 'mongo') {
    return new MongoStorageService(config);
  }
  if (mode === 'mysql') {
    return new MysqlStorageService(config);
  }
  return new StorageService();
}

@Injectable()
class StorageLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(StorageService)
    private readonly storage:
      | StorageService
      | FileStorageService
      | MongoStorageService
      | MysqlStorageService,
  ) {}

  async onModuleInit() {
    // FileStorageService 自带 load + seed + scheduleFlush
    // MongoStorageService / MysqlStorageService 的 onModuleInit 内含 连接 + 全量加载 + seed + 落库
    // 内存模式走 seed
    if (
      this.storage instanceof FileStorageService ||
      this.storage instanceof MongoStorageService ||
      this.storage instanceof MysqlStorageService
    ) {
      await this.storage.onModuleInit();
    } else {
      seedInitialData(this.storage);
      // 内存模式回算 nextId，避免种子 ID 与自增计数器冲突
      (this.storage as StorageService).recomputeNextId();
    }
  }

  async onModuleDestroy() {
    if (
      this.storage instanceof FileStorageService ||
      this.storage instanceof MongoStorageService ||
      this.storage instanceof MysqlStorageService
    ) {
      await this.storage.onModuleDestroy();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: (config: ConfigService) => createStorage(config),
      inject: [ConfigService],
    },
    StorageLifecycle,
    ScopeService,
  ],
  exports: [StorageService, ScopeService],
})
export class StorageModule {}
