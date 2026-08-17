-- ============================================
-- 强制清空业务表数据（供内网执行）
-- 若使用 duty_guard_clean.sql 导入后业务表仍有数据，
-- 说明导入过程中 DROP TABLE 未生效（常见于数据库账号缺少 DROP 权限），
-- 请单独执行本文件，用 TRUNCATE 清空业务表数据（保留表结构）。
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- 值班记录
TRUNCATE TABLE `records`;
-- 值班事项（工单明细）
TRUNCATE TABLE `items`;
-- 操作日志
TRUNCATE TABLE `operation_logs`;
-- 导出历史
TRUNCATE TABLE `export_history`;
-- 刷新令牌
TRUNCATE TABLE `refresh_tokens`;

SET FOREIGN_KEY_CHECKS = 1;
