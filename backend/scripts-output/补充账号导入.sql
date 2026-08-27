-- ============================================================
-- 补充服务点账号导入（源：补充值班记录网页版信息统计.xlsx）
-- 生成时间: 2026-08-25T03:31:35.054Z | 站点 8 个 | 账号 56 个
-- 幂等：INSERT IGNORE，重复执行安全；已存在的用户名/主键自动跳过
-- 默认密码：@站缩写_95598，首次登录强制修改（mustChangePassword=1）
-- 导入后需重启后端服务（内存缓存重新加载站点/用户）
-- ============================================================

USE `duty_guard`;

-- 新增供电所（id 81 起）
INSERT IGNORE INTO `stations` (`id`,`name`,`code`,`districtId`,`region`,`voltage`,`feeders`,`transformers`,`maxDutyItemsPerRecord`,`orderTimeLimit`,`isActive`,`createdAt`,`updatedAt`) VALUES
(81, '东城化纤服务点', 'dchx', 1, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(82, '东城体坛服务点', 'dctt', 1, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(83, '东城河滨服务点', 'dchb', 1, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(84, '西城世纪花园服务点', 'xsjhy', 1, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(85, '西城马尚服务点', 'xcms', 1, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(86, '西城齐润服务点', 'xcqr', 1, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(87, '城区供电服务站', 'cq3', 3, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(88, '淄博保税物流园区供电所供电服务班', 'zbbswlyq2', 9, NULL, NULL, 0, 0, 11, 60, 1, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z');

-- 新增账号（id 1612 起，班长=supervisor 所长权限，成员=duty_officer）
INSERT IGNORE INTO `users` (`id`,`username`,`passwordHash`,`realName`,`role`,`stationId`,`districtId`,`isActive`,`lastLoginAt`,`lastLoginIp`,`mustChangePassword`,`passwordPromptedAt`,`createdAt`,`updatedAt`) VALUES
(1612, 'dchxjiaoyumeng', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '焦玉萌', 'supervisor', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1613, 'dchxyubin', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '于彬', 'duty_officer', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1614, 'dchxwangjun', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '王俊', 'duty_officer', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1615, 'dchxwanghonggang', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '王洪刚', 'duty_officer', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1616, 'dchxzhengjiafeng', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '郑家峰', 'duty_officer', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1617, 'dchxcuiwei', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '崔伟', 'duty_officer', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1618, 'dchxdaizhenlei', '$2a$10$KVjbxaeX52uOY/Gn.ronROOsU3ZCMuqxRKr.CSQbOH5HnnobVGEYK', '戴振垒', 'duty_officer', 81, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1619, 'dcttxuchong', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '徐冲', 'supervisor', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1620, 'dcttliujun', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '刘军', 'duty_officer', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1621, 'dcttjiaoxianjie', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '焦宪杰', 'duty_officer', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1622, 'dcttyangxinrui', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '杨鑫瑞', 'duty_officer', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1623, 'dcttliujiawei', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '刘佳伟', 'duty_officer', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1624, 'dcttgaozhibo', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '高志波', 'duty_officer', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1625, 'dcttcuizeqin', '$2a$10$GIHrl/.IoOLIDhU42/K0OOJbegqbqZH47SY985pq7U/RTZiX3COJi', '崔泽钦', 'duty_officer', 82, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1626, 'dchbjinghongli', '$2a$10$XZ.GkqopYsn0iNEs5q191e7XrfJ8H7jhQYilQttqxSNNv8cYPDMu2', '荆鸿立', 'supervisor', 83, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1627, 'dchbpanlijie', '$2a$10$XZ.GkqopYsn0iNEs5q191e7XrfJ8H7jhQYilQttqxSNNv8cYPDMu2', '潘利杰', 'duty_officer', 83, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1628, 'dchbwangting', '$2a$10$XZ.GkqopYsn0iNEs5q191e7XrfJ8H7jhQYilQttqxSNNv8cYPDMu2', '王廷', 'duty_officer', 83, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1629, 'dchbyaochangzhong', '$2a$10$XZ.GkqopYsn0iNEs5q191e7XrfJ8H7jhQYilQttqxSNNv8cYPDMu2', '姚长忠', 'duty_officer', 83, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1630, 'dchbzhangxinyu', '$2a$10$XZ.GkqopYsn0iNEs5q191e7XrfJ8H7jhQYilQttqxSNNv8cYPDMu2', '张新宇', 'duty_officer', 83, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1631, 'xsjhylishukang', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '李述康', 'supervisor', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1632, 'xsjhyliutao', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '刘涛', 'duty_officer', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1633, 'xsjhyshendeqi', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '申德琦', 'duty_officer', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1634, 'xsjhykanyuntao', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '阚云涛', 'duty_officer', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1635, 'xsjhyguogang', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '郭刚', 'duty_officer', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1636, 'xsjhydingbo', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '丁波', 'duty_officer', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1637, 'xsjhymaxibang', '$2a$10$Q6zwxHUdF5e7oWvTqNJ1ZOTLHqjAW.SEyqy6wSMevs3OaN6f4gKfK', '马锡邦', 'duty_officer', 84, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1638, 'xcmsyuanhongkun', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '袁宏坤', 'supervisor', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1639, 'xcmshaojiandong', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '郝建东', 'duty_officer', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1640, 'xcmszhaocan', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '赵参', 'duty_officer', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1641, 'xcmsshaohongyan', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '邵红岩', 'duty_officer', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1642, 'xcmswangjiateng', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '王佳腾', 'duty_officer', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1643, 'xcmszhaopeng', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '赵鹏', 'duty_officer', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1644, 'xcmsxuhengbin', '$2a$10$7d9RywH0m2/34VF9EB9o7u3nxLsIwy0n3Te2wnJOzUlbYM2.R6T2m', '许恒滨', 'duty_officer', 85, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1645, 'xcqrliuzhihua', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '刘志华', 'supervisor', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1646, 'xcqrwangzhibin', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '王志彬', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1647, 'xcqrliuhongyuan', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '刘洪远', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1648, 'xcqrlizhizhe', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '李智哲', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1649, 'xcqrlihao', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '李昊', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1650, 'xcqrzhangteng', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '张腾', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1651, 'xcqrlitianyi', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '李天翊', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1652, 'xcqrwangruncheng', '$2a$10$WVEh/hLW3qxdOkhTBpIKkeh8T5Q9NDQc.D85Fa5cSHD1WXoIOj8hO', '王润成', 'duty_officer', 86, 1, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1653, 'cq3gexutao', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '葛续涛', 'supervisor', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1654, 'cq3xuxinjie', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '徐信杰', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1655, 'cq3jichen', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '汲辰', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1656, 'cq3congzheng', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '丛政', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1657, 'cq3yuluochuan', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '于洛川', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1658, 'cq3zhangyongji', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '张永吉', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1659, 'cq3yinguang', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '尹广', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1660, 'cq3zhouhongxiao', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '周洪霄', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1661, 'cq3tangshuai', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '唐帅', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1662, 'cq3zhengjiabing', '$2a$10$IthrjbmOu3QDMMbSfWjvgeiAFXppoG/xVw9gJU8FYYPH.WP0hmbla', '郑加兵', 'duty_officer', 87, 3, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1663, 'zbbswlyq2niuwenfeng', '$2a$10$Po.ULJ34qowgUENWNzQVU.xjGVlc5ixVQl8F6jn4qlQgTY.RCpIWK', '牛文峰', 'supervisor', 88, 9, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1664, 'zbbswlyq2chenxiangmou', '$2a$10$Po.ULJ34qowgUENWNzQVU.xjGVlc5ixVQl8F6jn4qlQgTY.RCpIWK', '陈祥谋', 'duty_officer', 88, 9, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1665, 'zbbswlyq2huqiang', '$2a$10$Po.ULJ34qowgUENWNzQVU.xjGVlc5ixVQl8F6jn4qlQgTY.RCpIWK', '胡强', 'duty_officer', 88, 9, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1666, 'zbbswlyq2zhangfeng', '$2a$10$Po.ULJ34qowgUENWNzQVU.xjGVlc5ixVQl8F6jn4qlQgTY.RCpIWK', '张峰', 'duty_officer', 88, 9, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z'),
(1667, 'zbbswlyq2zhangkai', '$2a$10$Po.ULJ34qowgUENWNzQVU.xjGVlc5ixVQl8F6jn4qlQgTY.RCpIWK', '张凯', 'duty_officer', 88, 9, 1, NULL, NULL, 1, NULL, '2026-08-25T03:31:35.054Z', '2026-08-25T03:31:35.054Z');

-- 导入校验（应分别返回 8 / 56）
SELECT COUNT(*) AS new_stations FROM stations WHERE id BETWEEN 81 AND 88;
SELECT COUNT(*) AS new_users FROM users WHERE username IN ('dchxjiaoyumeng','dchxyubin','dchxwangjun','dchxwanghonggang','dchxzhengjiafeng','dchxcuiwei','dchxdaizhenlei','dcttxuchong','dcttliujun','dcttjiaoxianjie','dcttyangxinrui','dcttliujiawei','dcttgaozhibo','dcttcuizeqin','dchbjinghongli','dchbpanlijie','dchbwangting','dchbyaochangzhong','dchbzhangxinyu','xsjhylishukang','xsjhyliutao','xsjhyshendeqi','xsjhykanyuntao','xsjhyguogang','xsjhydingbo','xsjhymaxibang','xcmsyuanhongkun','xcmshaojiandong','xcmszhaocan','xcmsshaohongyan','xcmswangjiateng','xcmszhaopeng','xcmsxuhengbin','xcqrliuzhihua','xcqrwangzhibin','xcqrliuhongyuan','xcqrlizhizhe','xcqrlihao','xcqrzhangteng','xcqrlitianyi','xcqrwangruncheng','cq3gexutao','cq3xuxinjie','cq3jichen','cq3congzheng','cq3yuluochuan','cq3zhangyongji','cq3yinguang','cq3zhouhongxiao','cq3tangshuai','cq3zhengjiabing','zbbswlyq2niuwenfeng','zbbswlyq2chenxiangmou','zbbswlyq2huqiang','zbbswlyq2zhangfeng','zbbswlyq2zhangkai');
