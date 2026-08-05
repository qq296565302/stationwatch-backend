# 供电所值守云平台 - 后端

> Nest.js 10 + TypeScript 5 + JWT
> 文档：[后端开发文档.md](../后端开发文档.md) | [API 接口文档](../API接口文档.md)

## 📚 接口文档

启动服务后：
- **Swagger UI**（可视化调试）：`http://localhost:3000/api/docs`
- **OpenAPI JSON**（导入 Postman）：`http://localhost:3000/api/docs-json`
- **Markdown 文档**：[API接口文档.md](../API接口文档.md)

## ⚠️ 当前状态

由于当前环境未安装 **MySQL 8** 和 **Redis 7**，本项目提供两种数据存储后端，通过 `STORAGE_MODE` 切换：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| `memory`（默认） | 进程内 `Map`，重启即丢 | 单次调试、跑测试 |
| `file` | 本地 JSON 文件，原子写、重启保留 | **推荐开发使用** |
| `mongo` | MongoDB，内存缓存 + 异步落库 | **生产部署** |

### 三级组织架构（市级 → 区县 → 供电所）

- **市级**：国网淄博供电公司，由 `admin`（超级管理员）代表，可管理全市所有区县与供电所
- **区县级**：淄博「五区三县」8 个供电中心（张店/临淄/淄川/博山/周村/桓台/高青/沂源），由 `district_admin`（区县管理员）管理本区县下所有供电所
- **供电所**：现有站点实体，归属某区县（`Station.districtId`），由所长 `supervisor` / 值班员 `duty_officer` 使用

> 角色可见范围由 `common/scope/scope.service.ts`（ScopeService）统一判定：admin 全部站 → district_admin 本区县站 → 其余本所。

### file 模式要点

- 数据文件：`./data/duty-guard.json`（可通过 `STORAGE_FILE_PATH` 改），当前 `STORAGE_VERSION=3`
- 写入策略：写操作标记 dirty，定时器（默认 2s，可通过 `STORAGE_FLUSH_INTERVAL_MS` 调）或进程退出时落盘
- 原子写：先写 `.tmp` 再 `rename`（POSIX/Windows 同卷下原子）
- 写入序列化：通过 promise chain 避免并发写导致脏数据
- 损坏恢复：JSON 解析失败或文件版本高于代码版本时，自动备份为 `.corrupted.<ts>` 并触发 seed 重建
- 版本升级：文件版本低于当前版本时执行**温和迁移（保留数据）**——灌入缺失的区县、为站点/用户回填 `districtId`
- 首次启动：自动写入种子数据（8 区县 / 1 站点 / 18 用户 / 字典 / 系统配置，含三级组织演示账号）
- 切换方式：`.env` 中修改 `STORAGE_MODE=file` 重启即可

后续切换到 MySQL 时，只需把 `StorageService` 改为基于 TypeORM 的实现，service 层的调用方式不变。

## 🚀 启动

```bash
# 安装依赖（已完成）
npm install

# 开发模式（热重载）
npm run start:dev

# 生产构建
npm run build
npm run start:prod
```

默认监听 `http://localhost:3000`，接口前缀 `/api/v1`。
Swagger 文档：`http://localhost:3000/api/docs`

## 🔐 默认账号

| 用户名 | 密码 | 角色 | 组织范围 |
|---|---|---|---|
| admin | admin123 | 市级超管 | 全市（国网淄博供电公司） |
| zd_admin | zd123456 | 区县管理员 | 张店区 |
| dongjiao_s | @zbdl-95598 | 所长 | 1 (东郊供电所) |
| lidong 等 15 名值班员 | @zbdl-95598 | 值班员 | 1 (东郊供电所) |

## 📁 目录结构

```
src/
├── main.ts                  # 入口
├── app.module.ts            # 根模块
├── common/                  # 公共：guards/decorators/filters/interceptors
├── storage/                 # 内存数据存储（替代 TypeORM + MySQL + Redis）
└── modules/
    ├── auth/                # 认证
    ├── users/               # 用户
    ├── districts/           # 区县（组织层级：市级→区县→供电所）
    ├── stations/            # 站点（供电所，归属区县）
    ├── duty-records/        # 值班记录（含核心 upsert）
    ├── duty-items/          # 值班工单
    ├── dictionaries/        # 字典
    ├── dashboard/           # 仪表板
    ├── exports/             # Excel 导出
    ├── system/              # 系统配置
    ├── search/              # 全局搜索
    ├── logs/                # 操作日志
    └── health/              # 健康检查
```

## 🔌 API 端点

### 认证
- `POST /api/v1/auth/login` 登录
- `POST /api/v1/auth/refresh` 刷新
- `POST /api/v1/auth/logout` 登出
- `GET  /api/v1/auth/me` 当前用户
- `PUT  /api/v1/auth/password` 修改密码

### 用户
- `GET    /api/v1/users`
- `POST   /api/v1/users`
- `GET    /api/v1/users/:id`
- `PUT    /api/v1/users/:id`
- `DELETE /api/v1/users/:id`
- `POST   /api/v1/users/:id/reset-password`

### 区县
- `GET /api/v1/districts`（登录即可，返回全部启用区县）

### 站点
- `GET    /api/v1/stations`（按角色可见范围：admin 全部 / 区县管理员本区县 / 其余本所）
- `GET    /api/v1/stations/:id`
- `POST   /api/v1/stations`（市级超管 / 区县管理员）
- `PUT    /api/v1/stations/:id`（区县管理员不可修改所属区县）
- `DELETE /api/v1/stations/:id`（存在用户/记录/导出引用时禁止删除）

### 值班记录
- `GET  /api/v1/records?startDate=&endDate=&stationId=&status=&page=&pageSize=`
- `GET  /api/v1/records/today`
- `GET  /api/v1/records/find-by-date?date=YYYY-MM-DD`
- `GET  /api/v1/records/:id`
- `POST /api/v1/records` （智能 upsert）
- `PUT  /api/v1/records/:id`
- `DELETE /api/v1/records/:id`
- `POST /api/v1/records/:id/lock`
- `POST /api/v1/records/:id/unlock`
- `POST /api/v1/records/:id/complete-all-items`

### 值班工单
- `GET    /api/v1/records/:recordId/items`
- `POST   /api/v1/records/:recordId/items`
- `PUT    /api/v1/records/:recordId/items/:itemId`
- `DELETE /api/v1/records/:recordId/items/:itemId`
- `POST   /api/v1/records/:recordId/items/:itemId/complete`
- `POST   /api/v1/records/:recordId/items/:itemId/uncomplete`

### 字典
- `GET /api/v1/dictionaries/business-types`
- `GET /api/v1/dictionaries/accept-contents`
- `GET /api/v1/dictionaries/results`
- `GET /api/v1/dictionaries/officers?stationId=`
- `GET /api/v1/dictionaries/weather-options`

### 仪表板
- `GET /api/v1/dashboard/stats?date=`
- `GET /api/v1/dashboard/activities?limit=20`
- `GET /api/v1/dashboard/alerts`
- `GET /api/v1/dashboard/monthly-stats?year=&month=`
- `GET /api/v1/dashboard/equipment-status`

### 导出
- `POST /api/v1/exports/monthly`
- `GET  /api/v1/exports/:id/status`
- `GET  /api/v1/exports/:id/download`
- `GET  /api/v1/exports?page=&pageSize=`

### 系统
- `GET /api/v1/system/config`
- `PUT /api/v1/system/config`

### 搜索
- `GET /api/v1/search?q=&limit=20`

### 日志
- `GET /api/v1/logs?userId=&action=&targetType=&startDate=&endDate=`

### 健康检查
- `GET /api/v1/health`

## 📝 响应格式

成功：
```json
{ "code": 0, "data": {...}, "message": "ok" }
```

失败：
```json
{ "code": 10001, "data": null, "message": "未认证" }
```

## 🔄 后续切换到 MySQL

1. `npm install @nestjs/typeorm typeorm mysql2 @nestjs/schedule`（可选）
2. 在 `src/storage/` 下添加 `typeorm-storage.service.ts`，实现与 `StorageService` 相同的接口
3. 在 `storage.module.ts` 中按 `STORAGE_MODE` 环境变量切换
4. 添加 `migrations/`、`seeds/` 目录
