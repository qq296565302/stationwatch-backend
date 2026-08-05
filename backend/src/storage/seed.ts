import { StorageService } from './storage.service';
import { Station, User, DictionaryItem, SystemConfig } from './types';

/**
 * 种子数据：站点、用户、字典、系统配置
 * 必须与前端 LoginView 演示账号保持一致
 */
export function seedInitialData(storage: StorageService) {
  const now = storage.now();

  // === 站点（仅 1 个：东郊供电所） ===
  const stations: Station[] = [
    {
      id: 1,
      name: '东郊供电所',
      code: 'EAST',
      region: '东郊',
      voltage: '10kV',
      feeders: 8,
      transformers: 24,
      maxDutyItemsPerRecord: 11,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  stations.forEach((s) => storage.saveStation(s));

  // === 用户（必须匹配前端 LoginView 演示账号） ===
  const users: User[] = [
    {
      id: 1,
      username: 'admin',
      passwordHash: '',
      realName: '超级管理员',
      role: 'admin',
      stationId: 1,
      isActive: true,
      lastLoginAt: null,
      lastLoginIp: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // 同步加密密码
  const bcrypt = require('bcryptjs');
  users[0].passwordHash = bcrypt.hashSync('admin123', 10);
  users.forEach((u) => storage.saveUser(u));

  // === 15 名值班员（id 4-18，初始排班 5 组每组 3 人，统一密码） ===
  // 组序与下方 duty.schedule 的 memberIds 一致：
  //   第一组 李栋/宋儒滨/王卓  第二组 朱玉峰/张方琦/曹永宏
  //   第三组 王永/王春康/颜知非  第四组 钱玉/赵金光/王欣  第五组 张振强/党传磊/刘辰琪
  const dutyOfficers: Array<{ id: number; username: string; realName: string }> = [
    { id: 4, username: 'wangyong', realName: '王永' },
    { id: 5, username: 'wangchunkang', realName: '王春康' },
    { id: 6, username: 'yanzhifei', realName: '颜知非' },
    { id: 7, username: 'qianyu', realName: '钱玉' },
    { id: 8, username: 'zhaojinguang', realName: '赵金光' },
    { id: 9, username: 'wangxin', realName: '王欣' },
    { id: 10, username: 'zhangzhenqiang', realName: '张振强' },
    { id: 11, username: 'dangchuanlei', realName: '党传磊' },
    { id: 12, username: 'liuchenqi', realName: '刘辰琪' },
    { id: 13, username: 'lidong', realName: '李栋' },
    { id: 14, username: 'songrubin', realName: '宋儒滨' },
    { id: 15, username: 'wangzhuo', realName: '王卓' },
    { id: 16, username: 'zhuyufeng', realName: '朱玉峰' },
    { id: 17, username: 'zhangfangqi', realName: '张方琦' },
    { id: 18, username: 'caoyonghong', realName: '曹永宏' },
  ];
  const dutyPasswordHash = bcrypt.hashSync('@zbdl-95598', 10);
  dutyOfficers.forEach((o) => {
    const u: User = {
      id: o.id,
      username: o.username,
      passwordHash: dutyPasswordHash,
      realName: o.realName,
      role: 'duty_officer',
      stationId: 1,
      isActive: true,
      lastLoginAt: null,
      lastLoginIp: null,
      createdAt: now,
      updatedAt: now,
    };
    storage.saveUser(u);
  });

  // === 字典：业务类型（按 spec 6 项） ===
  const businessTypes = [
    { label: '单户故障报修', sortOrder: 1 },
    { label: '多户故障报修', sortOrder: 2 },
    { label: '咨询服务', sortOrder: 3 },
    { label: '新装业务', sortOrder: 4 },
    { label: '迁改业务', sortOrder: 5 },
    { label: '投诉处理', sortOrder: 6 },
  ];
  businessTypes.forEach((b, i) => {
    const d: DictionaryItem = {
      id: i + 1,
      label: b.label,
      sortOrder: b.sortOrder,
      isActive: true,
      createdAt: now,
    };
    storage.saveBusinessType(d);
  });

  // === 字典：受理内容（按 spec） ===
  const acceptContents = [
    { label: '单户停电', sortOrder: 1 },
    { label: '多户停电', sortOrder: 2 },
    { label: '开具发票', sortOrder: 3 },
    { label: '用电咨询', sortOrder: 4 },
    { label: '表计故障', sortOrder: 5 },
    { label: '其他', sortOrder: 99 },
  ];
  acceptContents.forEach((b, i) => {
    const d: DictionaryItem = {
      id: i + 1,
      label: b.label,
      sortOrder: b.sortOrder,
      isActive: true,
      createdAt: now,
    };
    storage.saveAcceptContent(d);
  });

  // === 字典：处理结果（按 spec） ===
  const results = [
    { label: '表后开关落闸', sortOrder: 1 },
    { label: '表箱开关跳闸', sortOrder: 2 },
    { label: '客户内部故障', sortOrder: 3 },
    { label: '已恢复送电', sortOrder: 4 },
    { label: '已解释', sortOrder: 5 },
    { label: '已转派', sortOrder: 6 },
    { label: '待跟进', sortOrder: 99 },
  ];
  results.forEach((b, i) => {
    const d: DictionaryItem = {
      id: i + 1,
      label: b.label,
      sortOrder: b.sortOrder,
      isActive: true,
      createdAt: now,
    };
    storage.saveResultOption(d);
  });

  // 注意：值班员（officers）字典已废弃，值班员列表改为从 users 表按 stationId 过滤
  // 详见 DictionariesService.officers()

  // === 系统配置 ===
  const configs: SystemConfig[] = [
    {
      configKey: 'app.title',
      configValue: '供电所值守云平台',
      description: '系统名称',
      updatedBy: 1,
      updatedAt: now,
    },
    {
      configKey: 'duty.max_items_per_record',
      configValue: '11',
      description: '单条记录最大工单数',
      updatedBy: 1,
      updatedAt: now,
    },
    {
      configKey: 'weather.options',
      configValue: JSON.stringify([
        { value: 'sunny', label: '晴天' },
        { value: 'cloudy', label: '阴天' },
        { value: 'rainy', label: '雨天' },
        { value: 'windy', label: '大风' },
        { value: 'snowy', label: '雪天' },
        { value: 'foggy', label: '雾天' },
      ]),
      description: '天气选项',
      updatedBy: 1,
      updatedAt: now,
    },
    {
      configKey: 'duty.schedule',
      configValue: JSON.stringify({
        startDate: '2026-08-03',
        cycleDays: 5,
        groups: [
          { name: '第一组', sortOrder: 1, memberIds: [13, 14, 15] },
          { name: '第二组', sortOrder: 2, memberIds: [16, 17, 18] },
          { name: '第三组', sortOrder: 3, memberIds: [4, 5, 6] },
          { name: '第四组', sortOrder: 4, memberIds: [7, 8, 9] },
          { name: '第五组', sortOrder: 5, memberIds: [10, 11, 12] },
        ],
      }),
      description: '值班排班配置（固定轮询 5 组）',
      updatedBy: 1,
      updatedAt: now,
    },
  ];
  configs.forEach((c) => storage.saveSystemConfig(c));

  console.log('[Seed] 初始数据已加载（spec v2）');
  console.log('  - 站点: 1 个 (东郊供电所)');
  console.log('  - 用户: 16 个');
  console.log('    admin / admin123        → 超级管理员 (管理员, stationId=1)');
  console.log('    15 名值班员统一密码 @zbdl-95598（lidong/wangyong/... 等拼音账号）');
  console.log('  - 字典: 业务类型 6 / 受理内容 6 / 处理结果 7');
  console.log('  - 值班员: 来自 users 表按 stationId 过滤');
  console.log('  - 系统配置: 4 项（含 duty.schedule 值班排班：5 组 5 天一轮）');
}
