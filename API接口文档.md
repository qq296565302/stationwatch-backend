# 供电所值守云平台 - API 接口使用文档

> **版本**：v1.0
> **Base URL**：`http://localhost:3000/api/v1`
> **Swagger UI**：`http://localhost:3000/api/docs`
> **OpenAPI JSON**：`http://localhost:3000/api/docs-json`
> **技术栈**：Nest.js 10 + TypeScript 5 + JWT + class-validator

---

## 一、快速开始

### 1.1 启动服务

```bash
cd "d:\SGCC Root\供电所值守云平台后端\backend"
npm run start:dev   # 开发模式（热重载）
# 或
npm run build && npm run start:prod   # 生产模式
```

启动成功后控制台输出：
```
🚀 Application is running on: http://localhost:3000/api/v1
📚 Swagger docs: http://localhost:3000/api/docs
```

### 1.2 默认账号（种子数据）

| 用户名 | 密码 | 角色 | 所属站点 |
|---|---|---|---|
| `admin` | `admin123` | 管理员 | - |
| `supervisor1` | `admin123` | 所长 | 1（东郊供电所） |
| `officer1` | `officer123` | 值班员 | 1（东郊供电所） |
| `officer2` | `officer123` | 值班员 | 1（东郊供电所） |
| `officer3` | `officer123` | 值班员 | 2（西郊供电所） |

### 1.3 使用 Swagger UI 调试

1. 浏览器打开 `http://localhost:3000/api/docs`
2. 点击右上角 **Authorize** 按钮
3. 在 `Value` 输入框填入 `Bearer <accessToken>`（仅输入 token 部分，不需要 "Bearer " 前缀）
4. 点击 **Authorize** 后即可测试所有需要鉴权的接口

### 1.4 curl 调试示例

```bash
# 1. 登录获取 token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

# 2. 调用需要鉴权的接口
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"

# 3. 创建值班记录（upsert）
curl -X POST http://localhost:3000/api/v1/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recordDate": "2026-07-31",
    "stationId": 1,
    "weather": "sunny",
    "weatherLabel": "晴天",
    "dutyItems": [
      {
        "businessType": "故障报修",
        "content": "东郊路 123 号停电",
        "customerName": "张三",
        "customerPhone": "13800138000"
      }
    ]
  }'
```

---

## 二、通用约定

### 2.1 认证方式

除 `/auth/login`、`/auth/refresh`、`/health` 外，所有接口都需要在请求头携带：

```
Authorization: Bearer <accessToken>
```

Access Token 有效期 **2 小时**，Refresh Token 有效期 **7 天**。

### 2.2 响应格式

**成功**：
```json
{ "code": 0, "data": {...}, "message": "ok" }
```

**失败**：
```json
{ "code": 10001, "data": null, "message": "未认证" }
```

**分页**：
```json
{
  "code": 0,
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "message": "ok"
}
```

### 2.3 错误码

| 范围 | 类别 |
|---|---|
| 0 | 成功 |
| 1xxx | 通用错误（认证、权限、参数） |
| 2xxx | 业务错误 |
| 5xxx | 服务器错误 |

| 错误码 | HTTP 状态 | 含义 |
|---|---|---|
| 10001 | 401 | 未认证 / 账号或密码错误 |
| 10002 | 401 | Token 过期 |
| 10003 | 403 | 权限不足 |
| 10004 | 400 | 参数校验失败 |
| 10005 | 404 | 资源不存在 |
| 10006 | 409 | 资源冲突 |
| 20001 | 404 | 记录不存在 |
| 20002 | 409 | 记录已存在 |
| 20003 | 403 | 记录已锁定 |
| 20004 | 400 | 工单数超限 |
| 20005 | 400 | 手机号格式错误 |
| 20006 | 400 | 时间格式错误 |
| 50000 | 500 | 服务器错误 |

### 2.4 角色权限

| 操作 | 值班员 | 所长 | 管理员 |
|---|:---:|:---:|:---:|
| 查看本所所有记录 | ✓ | ✓ | ✓ |
| 创建值班记录 | ✓ | ✓ | ✓ |
| 编辑自己创建的记录 | ✓ | ✓ | ✓ |
| 编辑他人创建的记录 | ✗ | ✓ | ✓ |
| 标记工单完成 | ✓ | ✓ | ✓ |
| 锁定记录 | ✗ | ✓ | ✓ |
| 解锁记录 | ✗ | ✗ | ✓ |
| 删除记录 | ✗ | ✗ | ✓ |
| Excel 导出 | ✗ | ✓ | ✓ |
| 用户管理 | ✗ | ✗ | ✓ |
| 站点配置 | ✗ | ✗ | ✓ |
| 系统配置 | ✗ | ✗ | ✓ |
| 查看操作日志 | ✗ | ✗ | ✓ |

---

## 三、接口清单

### 00. 健康检查（公开）

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/v1/health` | 公开 | 健康检查 |
| GET | `/api/v1/health/ping` | 公开 | Ping |

### 01. 认证

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| POST | `/api/v1/auth/login` | 公开 | 登录 |
| POST | `/api/v1/auth/refresh` | 公开 | 刷新访问令牌 |
| POST | `/api/v1/auth/logout` | Bearer | 登出（撤销 refresh token） |
| GET | `/api/v1/auth/me` | Bearer | 当前用户信息 |
| PUT | `/api/v1/auth/password` | Bearer | 修改密码 |

#### 1. POST /auth/login

**请求**：
```json
{ "username": "admin", "password": "admin123" }
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1, "username": "admin", "realName": "系统管理员",
      "role": "admin", "stationId": null, "isActive": true
    }
  },
  "message": "ok"
}
```

#### 2. POST /auth/refresh

**请求**：`{ "refreshToken": "<refreshToken>" }`
**响应**：`{ "code": 0, "data": { "accessToken": "..." } }`

---

### 02. 用户管理（仅管理员）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/users?role=&stationId=&page=&pageSize=` | 用户列表（分页） |
| POST | `/api/v1/users` | 创建用户 |
| GET | `/api/v1/users/:id` | 用户详情 |
| PUT | `/api/v1/users/:id` | 更新用户 |
| DELETE | `/api/v1/users/:id` | 删除用户 |
| POST | `/api/v1/users/:id/reset-password` | 重置密码 |

#### 创建用户示例

```json
POST /api/v1/users
{
  "username": "zhangsan",
  "password": "pass123456",
  "realName": "张三",
  "role": "duty_officer",
  "stationId": 1
}
```

---

### 03. 站点管理

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/v1/stations` | Bearer | 站点列表（所有登录用户） |
| GET | `/api/v1/stations/:id` | Bearer | 站点详情 |
| PUT | `/api/v1/stations/:id` | 管理员 | 更新站点 |

---

### 04. 值班记录 ⭐ 核心模块

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/v1/records?startDate=&endDate=&stationId=&status=&page=&pageSize=&sortBy=&sortOrder=` | Bearer | 分页查询 |
| GET | `/api/v1/records/today` | Bearer | 当天记录（按当前用户站点） |
| GET | `/api/v1/records/find-by-date?date=YYYY-MM-DD` | Bearer | 按日期查找 |
| GET | `/api/v1/records/:id` | Bearer | 详情 |
| POST | `/api/v1/records` | Officer+ | **智能 upsert** |
| PUT | `/api/v1/records/:id` | 创建者/Supervisor | 更新 |
| DELETE | `/api/v1/records/:id` | 管理员 | 删除（级联删除工单） |
| POST | `/api/v1/records/:id/lock` | Supervisor+ | 锁定 |
| POST | `/api/v1/records/:id/unlock` | 管理员 | 解锁 |
| POST | `/api/v1/records/:id/complete-all-items` | Officer+ | 一键完成所有工单 |

#### 核心接口：POST /api/v1/records 智能 upsert

**业务逻辑**：
1. 查找 `(stationId, recordDate)` 是否已存在
2. **存在** → 合并工单（有 `id` 更新，无 `id` 追加；`otherMatters`/`pendingIssues` 用 `\n` 追加）
3. **不存在** → 新建
4. 重算 `itemCount` / `completedCount` / `hasPending`
5. 返回完整记录（含 `items` 数组）

**请求示例（新建）**：
```json
POST /api/v1/records
{
  "recordDate": "2026-07-31",
  "stationId": 1,
  "weather": "sunny",
  "weatherLabel": "晴天",
  "dutyItems": [
    {
      "businessType": "故障报修",
      "content": "东郊路 123 号停电",
      "customerName": "张三",
      "customerPhone": "13800138000",
      "customerAddress": "东郊路 123 号",
      "handler": "王值班"
    }
  ],
  "otherMatters": "上午完成例行巡检",
  "pendingIssues": "2 号变压器待维修"
}
```

**请求示例（追加工单）**：
```json
POST /api/v1/records
{
  "recordDate": "2026-07-31",
  "stationId": 1,
  "weather": "sunny",
  "weatherLabel": "晴天",
  "dutyItems": [
    {
      "id": 1,
      "businessType": "故障报修",
      "content": "东郊路 123 号停电（已修复）",
      "isCompleted": true
    },
    {
      "businessType": "业务咨询",
      "content": "咨询电费阶梯"
    }
  ]
}
```

**响应（完整记录）**：
```json
{
  "code": 0,
  "data": {
    "id": 1, "recordDate": "2026-07-31", "stationId": 1,
    "weather": "sunny", "weatherLabel": "晴天",
    "creatorId": 1, "status": "active",
    "itemCount": 2, "completedCount": 1, "hasPending": false,
    "otherMatters": "上午完成例行巡检", "pendingIssues": "2 号变压器待维修",
    "items": [
      { "id": 1, "recordId": 1, "businessType": "故障报修", "content": "东郊路 123 号停电（已修复）",
        "acceptTime": "08:30", "endTime": "10:15", "isCompleted": true, ... },
      { "id": 2, "recordId": 1, "businessType": "业务咨询", "content": "咨询电费阶梯",
        "acceptTime": "11:00", "endTime": null, "isCompleted": false, ... }
    ],
    "station": { "id": 1, "name": "东郊供电所", "code": "EAST" },
    "creator": { "id": 1, "username": "admin", "realName": "系统管理员" }
  }
}
```

---

### 05. 值班工单

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/v1/records/:recordId/items` | Bearer | 工单列表 |
| POST | `/api/v1/records/:recordId/items` | Officer+ | 添加工单（acceptTime 自动 = 当前 HH:MM） |
| PUT | `/api/v1/records/:recordId/items/:itemId` | Officer+ | 更新工单 |
| DELETE | `/api/v1/records/:recordId/items/:itemId` | Officer+ | 删除工单 |
| POST | `/api/v1/records/:recordId/items/:itemId/complete` | Officer+ | **标记完成**（强制覆盖 endTime） |
| POST | `/api/v1/records/:recordId/items/:itemId/uncomplete` | Officer+ | 撤销完成 |

**注意**：
- `complete` 会强制将 `endTime` 设为当前 HH:MM，即使前端传了也不采用
- 添加工单时 `acceptTime` 自动 = 当前 HH:MM
- 工单数受 `station.maxDutyItemsPerRecord`（默认 11）限制

---

### 06. 字典

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/dictionaries/business-types` | 业务类型 |
| GET | `/api/v1/dictionaries/accept-contents` | 受理内容 |
| GET | `/api/v1/dictionaries/results` | 处理结果 |
| GET | `/api/v1/dictionaries/officers?stationId=` | 值班员（按站点过滤） |
| GET | `/api/v1/dictionaries/weather-options` | 天气选项（来自 system_configs） |

**响应示例**（业务类型）：
```json
{
  "code": 0,
  "data": [
    { "id": 1, "label": "故障报修", "sortOrder": 1, "isActive": true },
    { "id": 2, "label": "业务咨询", "sortOrder": 2, "isActive": true },
    ...
  ]
}
```

**天气选项**：
```json
{
  "code": 0,
  "data": [
    { "value": "sunny", "label": "晴天" },
    { "value": "cloudy", "label": "多云" },
    { "value": "rainy", "label": "雨天" },
    { "value": "stormy", "label": "雷雨" },
    { "value": "snowy", "label": "雪天" },
    { "value": "foggy", "label": "雾天" }
  ]
}
```

---

### 07. 仪表板

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/dashboard/stats?date=` | 顶部统计 |
| GET | `/api/v1/dashboard/activities?limit=20` | 最近活动 |
| GET | `/api/v1/dashboard/alerts` | 告警列表 |
| GET | `/api/v1/dashboard/monthly-stats?year=&month=` | 月度统计（按业务类型分组） |
| GET | `/api/v1/dashboard/equipment-status` | 设备状态 |

**stats 响应**：
```json
{
  "code": 0,
  "data": {
    "todayRecord": { "id": 1, "recordDate": "2026-07-31", "itemCount": 2, "completedCount": 1, "status": "active", "stationName": "东郊供电所" },
    "todayItemCount": 2,
    "todayCompleted": 1,
    "monthRecordCount": 5,
    "lockedCount": 0,
    "pendingCount": 1
  }
}
```

---

### 08. 导出

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| POST | `/api/v1/exports/monthly` | Supervisor+ | 生成月度 Excel 报告 |
| GET | `/api/v1/exports/:id/status` | Officer+ | 导出状态 |
| GET | `/api/v1/exports/:id/download` | Officer+ | 下载 .xlsx 文件流 |
| GET | `/api/v1/exports?page=&pageSize=` | Officer+ | 导出历史列表 |

**生成月度报告**：
```json
POST /api/v1/exports/monthly
{
  "year": 2026,
  "month": 7,
  "stationId": 1,
  "includeTemplate": true,
  "mergeSheets": true
}
```

**响应**：
```json
{
  "code": 0,
  "data": {
    "id": 1,
    "fileName": "值班记录_2026-07_1_1785485740955.xlsx",
    "fileSize": 7921,
    "year": 2026, "month": 7, "stationId": 1,
    "operatorId": 1, "status": "done",
    "createdAt": "2026-07-31T08:15:40.979Z"
  }
}
```

下载：`GET /api/v1/exports/1/download`（浏览器自动下载）

---

### 09. 系统配置

| Method | Path | 鉴权 | 用途 |
|---|---|---|---|
| GET | `/api/v1/system/config` | Bearer | 获取所有配置 |
| PUT | `/api/v1/system/config` | 管理员 | 更新配置 |

**请求示例**：
```json
PUT /api/v1/system/config
{
  "configs": {
    "app.title": "供电所值守云平台",
    "duty.max_items_per_record": 11
  }
}
```

**响应**：
```json
{
  "code": 0,
  "data": [
    { "configKey": "app.title", "configValue": "\"供电所值守云平台\"", "description": "系统名称", "updatedBy": 1, "updatedAt": "..." },
    { "configKey": "weather.options", "configValue": "[{\"value\":\"sunny\",\"label\":\"晴天\"},...]", "description": "天气选项", ... }
  ]
}
```

---

### 10. 搜索

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/search?q=&limit=20` | 全局搜索（记录级 + 工单级） |

**搜索字段**：
- 记录级：`otherMatters` / `pendingIssues` / `weatherLabel`
- 工单级：`content` / `businessType` / `customerName` / `customerPhone` / `customerAddress` / `handler` / `result`

**响应**：
```json
{
  "code": 0,
  "data": [
    {
      "type": "record",
      "recordId": 1,
      "recordDate": "2026-07-31",
      "title": "2026-07-31 · 东郊供电所",
      "snippet": "...上午完成例行巡检..."
    },
    {
      "type": "item",
      "recordId": 1,
      "recordDate": "2026-07-31",
      "itemId": 1,
      "businessType": "故障报修",
      "title": "东郊路 123 号停电",
      "snippet": "故障报修 · 张三 · 东郊供电所"
    }
  ]
}
```

---

### 11. 操作日志（仅管理员）

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/v1/logs?userId=&action=&targetType=&startDate=&endDate=&page=&pageSize=` | 日志列表（自动记录） |

所有受 JWT 保护的非公开接口都会被 `LoggingInterceptor` 自动记录。

---

## 四、前端集成示例（Vue 3 + Pinia）

```typescript
// src/api/client.ts
import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3000/api/v1',
  timeout: 15000,
});

// 请求拦截：自动加 token
api.interceptors.request.use((config) => {
  const auth = JSON.parse(localStorage.getItem('dutyguard_auth') || '{}');
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

// 响应拦截：自动 refresh
api.interceptors.response.use(
  (resp) => resp.data.data,
  async (error: AxiosError) => {
    const auth = JSON.parse(localStorage.getItem('dutyguard_auth') || '{}');
    if (error.response?.status === 401 && auth.refreshToken) {
      try {
        const { data } = await axios.post(
          'http://localhost:3000/api/v1/auth/refresh',
          { refreshToken: auth.refreshToken },
        );
        localStorage.setItem('dutyguard_auth', JSON.stringify({
          ...auth,
          accessToken: data.data.accessToken,
        }));
        // 重试原请求
        if (error.config) {
          error.config.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api.request(error.config);
        }
      } catch {
        localStorage.removeItem('dutyguard_auth');
        window.location.href = '/login';
      }
    }
    // 业务错误
    if (error.response?.data) {
      const body: any = error.response.data;
      const err: any = new Error(body.message || '请求失败');
      err.code = body.code;
      throw err;
    }
    throw error;
  },
);

export default api;

// 使用
// await api.post('/auth/login', { username: 'admin', password: 'admin123' });
// await api.get('/records', { params: { page: 1, pageSize: 20 } });
// await api.post('/records', recordData);
```

---

## 五、附录

### 5.1 数据库实体（暂用内存 Map，可平滑切换到 TypeORM）

| 实体 | 说明 |
|---|---|
| `users` | 用户 |
| `stations` | 站点 |
| `duty_records` | 值班记录 |
| `duty_items` | 值班工单 |
| `business_types` | 业务类型字典 |
| `accept_contents` | 受理内容字典 |
| `result_options` | 处理结果字典 |
| `officers` | 值班员字典 |
| `system_configs` | 系统配置 |
| `export_history` | 导出历史 |
| `operation_logs` | 操作日志 |

### 5.2 Swagger 工具

- **Swagger UI**：`http://localhost:3000/api/docs`（可视化调试）
- **OpenAPI JSON**：`http://localhost:3000/api/docs-json`（可导入 Postman/Apifox）
- **OpenAPI YAML**：`http://localhost:3000/api/docs-yaml`

### 5.3 关闭 Swagger

修改 `.env`：
```bash
SWAGGER_ENABLED=false
```

### 5.4 项目结构

```
backend/
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env.example
├── README.md
└── src/
    ├── main.ts                  # 入口（含 Swagger 配置）
    ├── app.module.ts
    ├── common/                  # 公共
    │   ├── decorators/          # @Public @CurrentUser @Roles
    │   ├── guards/              # JwtAuthGuard RolesGuard
    │   ├── filters/             # AllExceptionsFilter
    │   ├── interceptors/        # TransformInterceptor LoggingInterceptor
    │   ├── exceptions/          # BusinessException
    │   ├── types/               # Role UserPayload
    │   └── swagger/             # @ApiResponse 响应类型
    ├── storage/                 # 内存数据存储（替代 TypeORM + MySQL + Redis）
    │   ├── storage.module.ts
    │   ├── storage.service.ts
    │   ├── seed.ts              # 种子数据
    │   └── types.ts             # 实体类型
    └── modules/
        ├── auth/                # 认证
        ├── users/               # 用户
        ├── stations/            # 站点
        ├── duty-records/        # 值班记录
        ├── duty-items/          # 值班工单
        ├── dictionaries/        # 字典
        ├── dashboard/           # 仪表板
        ├── exports/             # Excel 导出
        ├── system/              # 系统配置
        ├── search/              # 全局搜索
        ├── logs/                # 操作日志
        └── health/              # 健康检查
```

### 5.5 联系

- 后端代码：[`backend/`](file:///d:/SGCC%20Root/%E4%BE%9B%E7%94%B5%E6%89%80%E5%80%BC%E5%AE%88%E4%BA%91%E5%B9%B3%E5%8F%B0%E5%90%8E%E7%AB%AF/backend)
- 后端开发文档：[`后端开发文档.md`](file:///d:/SGCC%20Root/%E4%BE%9B%E7%94%B5%E6%89%80%E5%80%BC%E5%AE%88%E4%BA%91%E5%B9%B3%E5%8F%B0%E5%90%8E%E7%AB%AF/%E5%90%8E%E7%AB%AF%E5%BC%80%E5%8F%91%E6%96%87%E6%A1%A3.md)
- 前端项目：[`../供电所值守云平台前端/`](../供电所值守云平台前端/)
