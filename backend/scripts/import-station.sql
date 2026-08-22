-- ============================================================
-- 增量导入供电所：城区供电服务站（隶属临淄供电中心）
-- 适用：Navicat / DBeaver / mysql 命令行均可直接运行
-- 特点：不使用跨语句用户变量，全部内联子查询，每条语句独立可执行
-- 幂等：供电所/账号已存在则自动跳过，可重复执行
-- ============================================================

SET NAMES utf8mb4;

-- 1) 新建供电所（不存在才插入；districtId 内联取临淄 id=2）
INSERT INTO `stations`
  (`id`, `name`, `code`, `districtId`, `region`, `voltage`, `feeders`, `transformers`,
   `orderTimeLimit`, `isActive`, `createdAt`, `updatedAt`)
SELECT
  (SELECT IFNULL(MAX(`id`), 0) + 1 FROM `stations`),
  '城区供电服务站', 'csz',
  (SELECT `id` FROM `districts` WHERE `name` = '临淄供电中心'),
  NULL, NULL, 0, 0, 60, 1, '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `stations`
  WHERE `name` = '城区供电服务站'
    AND `districtId` = (SELECT `id` FROM `districts` WHERE `name` = '临淄供电中心')
);

-- 2) 插入所长 + 值班员账号（stationId/districtId 均内联取，id 用 ROW_NUMBER 自动分配连续值）
--    密码统一 @csz_95598（bcrypt 加密）；mustChangePassword=1 首次登录需改密
--    已存在账号（uk_users_username）自动跳过，不覆盖
INSERT INTO `users`
  (`id`, `username`, `passwordHash`, `realName`, `role`, `stationId`, `districtId`, `isActive`,
   `lastLoginAt`, `lastLoginIp`, `mustChangePassword`, `passwordPromptedAt`, `createdAt`, `updatedAt`)
SELECT
  (SELECT IFNULL(MAX(`id`), 0) FROM `users`) + t.rn,
  t.username,
  '$2a$10$DAqwYImA5eBpYNakBOr2Xun07w53VNmu6lU3M.VPUOQbQPYOwSGiS',
  t.realName, t.role,
  (SELECT `id` FROM `stations` WHERE `name` = '城区供电服务站' LIMIT 1),
  (SELECT `id` FROM `districts` WHERE `name` = '临淄供电中心'),
  1, NULL, NULL, 1, NULL, '2026-08-21T00:00:00.000Z', '2026-08-21T00:00:00.000Z'
FROM (
  SELECT 1  AS rn, 'cszliutongyin'   AS username, '刘同银' AS realName, 'supervisor'   AS role
  UNION ALL SELECT 2,  'cszwangmingchao', '王明超', 'duty_officer'
  UNION ALL SELECT 3,  'cszfengzhankai',  '冯占凯', 'duty_officer'
  UNION ALL SELECT 4,  'cszsunshigang',   '孙士刚', 'duty_officer'
  UNION ALL SELECT 5,  'cszlangxudong',   '郎需栋', 'duty_officer'
  UNION ALL SELECT 6,  'cszzhaoyunxiang', '赵云祥', 'duty_officer'
  UNION ALL SELECT 7,  'cszzhangkeqin',   '张珂钦', 'duty_officer'
  UNION ALL SELECT 8,  'cszlijiaxin',     '李嘉欣', 'duty_officer'
  UNION ALL SELECT 9,  'cszchenyiqian',   '陈宜谦', 'duty_officer'
  UNION ALL SELECT 10, 'cszwangpeng',     '王鹏',   'duty_officer'
  UNION ALL SELECT 11, 'cszsunzhenzhong', '孙振中', 'duty_officer'
  UNION ALL SELECT 12, 'cszyangjian',     '杨健',   'duty_officer'
  UNION ALL SELECT 13, 'cszluhainan',     '路海南', 'duty_officer'
  UNION ALL SELECT 14, 'cszliwenyan',     '李文燕', 'duty_officer'
  UNION ALL SELECT 15, 'cszwanghanxiang', '王汉祥', 'duty_officer'
  UNION ALL SELECT 16, 'cszwangjianli',   '王建力', 'duty_officer'
  UNION ALL SELECT 17, 'cszwangxiaofeng', '王效峰', 'duty_officer'
  UNION ALL SELECT 18, 'cszzhouxiaohan',  '周晓涵', 'duty_officer'
  UNION ALL SELECT 19, 'cszwanghaogang',  '王浩港', 'duty_officer'
  UNION ALL SELECT 20, 'cszlvxucheng',    '吕绪成', 'duty_officer'
  UNION ALL SELECT 21, 'cszhanyingxiang', '韩迎祥', 'duty_officer'
  UNION ALL SELECT 22, 'cszyuanwenjie',   '袁文杰', 'duty_officer'
  UNION ALL SELECT 23, 'cszwangjinglei',  '王景磊', 'duty_officer'
) t
ON DUPLICATE KEY UPDATE `id` = `id`;  -- 已存在账号跳过

-- ============================================================
-- 校验（执行后应能查到 1 个供电所 + 23 个账号）：
-- SELECT id,name,districtId FROM stations WHERE name='城区供电服务站';
-- SELECT username,realName,role FROM users WHERE stationId=(SELECT id FROM stations WHERE name='城区供电服务站');
-- ============================================================
