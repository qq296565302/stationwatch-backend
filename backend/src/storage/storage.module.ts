import { Inject, Injectable, Module, Global, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { FileStorageService } from './file-storage.service';
import { MongoStorageService } from './mongo-storage.service';
import { seedInitialData } from './seed';

/**
 * 存储模块
 * - 内存模式（默认）：原 StorageService
 * - 文件模式：FileStorageService，落盘 JSON，重启保留数据
 * - Mongo 模式：MongoStorageService，内存缓存 + 异步落库 MongoDB
 * 切换：STORAGE_MODE=memory | file | mongo
 */
function createStorage(config: ConfigService): StorageService | FileStorageService | MongoStorageService {
  const mode = (config.get<string>('STORAGE_MODE') || 'memory').toLowerCase();
  if (mode === 'file') {
    return new FileStorageService(config);
  }
  if (mode === 'mongo') {
    return new MongoStorageService(config);
  }
  return new StorageService();
}

@Injectable()
class StorageLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(StorageService)
    private readonly storage: StorageService | FileStorageService | MongoStorageService,
  ) {}

  async onModuleInit() {
    // FileStorageService 自带 load + seed + scheduleFlush
    // MongoStorageService 的 onModuleInit 内含 连接 + 全量加载 + seed + 落库
    // 内存模式走 seed
    if (
      this.storage instanceof FileStorageService ||
      this.storage instanceof MongoStorageService
    ) {
      await this.storage.onModuleInit();
    } else {
      seedInitialData(this.storage);
    }
  }

  async onModuleDestroy() {
    if (
      this.storage instanceof FileStorageService ||
      this.storage instanceof MongoStorageService
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
  ],
  exports: [StorageService],
})
export class StorageModule {}
