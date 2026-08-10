import { ValidationError } from '@nestjs/common';

/** class-validator 约束 key → 中文原因（仅当 DTO 未自定义 message 时兜底） */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  isDefined: '不能为空',
  isNotEmpty: '不能为空',
  isString: '必须是文本',
  isInt: '必须是整数',
  isNumber: '必须是数字',
  isBoolean: '必须是布尔值',
  isDateString: '日期格式应为 YYYY-MM-DD',
  isIn: '取值不在允许范围内',
  isEnum: '取值不在允许范围内',
  isArray: '必须是数组',
  matches: '格式不正确',
  maxLength: '长度超出限制',
  minLength: '长度不足',
  isEmail: '邮箱格式错误',
  isPhoneNumber: '手机号格式错误',
  isObject: '格式不正确',
};

/** 是否 class-validator 自动生成的默认英文 message（自定义 message 保留原样） */
function isAutoMessage(msg: string): boolean {
  return /must be|each value|should not|is not allowed|too (long|short)|not allowed to be empty/i.test(msg);
}

/** class-validator 字段名 → 中文标签（覆盖业务常用 DTO 字段） */
const FIELD_LABELS: Record<string, string> = {
  recordDate: '业务日期',
  date: '业务日期',
  stationId: '站点',
  weather: '天气',
  weatherLabel: '天气',
  otherMatters: '其他事项',
  pendingIssues: '遗留问题',
  dutyItems: '工单',
  businessType: '业务类型',
  content: '受理内容',
  acceptTime: '受理时间',
  endTime: '完成时间',
  customerName: '客户名称',
  customerPhone: '联系电话',
  customerAddress: '联系地址',
  handler: '办理人员',
  result: '处理结果',
  isCompleted: '完成状态',
  username: '用户名',
  password: '密码',
  oldPassword: '原密码',
  newPassword: '新密码',
  refreshToken: '刷新令牌',
  realName: '姓名',
  stationName: '站点名称',
  districtId: '区县',
  configKey: '配置项',
  year: '年份',
  month: '月份',
  startDate: '开始日期',
  endDate: '结束日期',
  keyword: '关键词',
  q: '关键词',
  status: '状态',
  page: '页码',
  pageSize: '每页数量',
  sortBy: '排序字段',
  sortOrder: '排序方式',
  name: '名称',
  code: '编码',
  phone: '联系电话',
  sortOrderNum: '排序',
};

/**
 * 把字段路径段翻译成可读中文。
 * 规则：`dutyItems` → 工单；纯数字索引与前段「工单」合并为「第 N 项工单」；其余按标签表映射，未映射保留原名。
 * 例：['dutyItems', '0', 'customerPhone'] → 「第 1 项工单·联系电话」
 */
function formatPath(segments: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (/^\d+$/.test(seg)) {
      const prev = segments[i - 1];
      const prevLabel = prev ? FIELD_LABELS[prev] || prev : '';
      const itemLabel = prevLabel.includes('工单') ? '工单' : prevLabel;
      // 数字索引消费掉前一段（如「工单」），避免重复
      if (prev && parts.length && parts[parts.length - 1] === prevLabel) parts.pop();
      parts.push(`第 ${Number(seg) + 1} 项${itemLabel}`);
      continue;
    }
    parts.push(FIELD_LABELS[seg] || seg);
  }
  return parts.join('·');
}

/**
 * 把 class-validator 校验错误树还原为可读中文列表。
 * 例：dutyItems[0].customerPhone 手机号格式错误 → 「第 1 项工单·联系电话：手机号格式错误」
 */
export function formatValidationErrors(errors: ValidationError[]): string[] {
  const out: string[] = [];
  const walk = (list: ValidationError[], path: string[] = []) => {
    for (const e of list) {
      if (e.constraints && Object.keys(e.constraints).length) {
        const keys = Object.keys(e.constraints);
        const raw = e.constraints[keys[0]] || '参数校验失败';
        const msg =
          isAutoMessage(raw) && CONSTRAINT_MESSAGES[keys[0]]
            ? CONSTRAINT_MESSAGES[keys[0]]
            : raw;
        out.push(`${formatPath([...path, e.property])}：${msg}`);
      }
      if (e.children && e.children.length) {
        walk(e.children, [...path, e.property]);
      }
    }
  };
  walk(errors);
  return out;
}
