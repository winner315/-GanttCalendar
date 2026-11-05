-- 排期表 —— 与 Android 版 app/src/main/java/com/gather/ganttcalendar/data/ScheduleDbHelper.kt
-- 的 schedule 表同语义：epochDay 天数序号（1970-01-01 = 0）。
-- 与 LocalDate.toEpochDay()、前端 utils/date.js 的 toDayNumber() 三者同构。
--
-- 幂等：可重复执行。
CREATE TABLE IF NOT EXISTS `schedule` (
  `id`         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(60)      NOT NULL,
  `start_date` INT              NOT NULL,
  `end_date`   INT              NOT NULL,
  `color`      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- 任务状态：todo 待办 / doing 进行中 / done 已完成 / paused 已暂停
  -- 用 VARCHAR 而不是 ENUM —— 以后想加取值（比如 canceled）不用 ALTER TABLE。
  -- 取值范围由 server/schedule/mapper.py 校验，非法值归 'todo'，不靠数据库拦。
  `status`     VARCHAR(20)      NOT NULL DEFAULT 'todo',
  -- 备注：选填，甘特色带悬浮显示；空串表示无备注。VARCHAR(500) 够日常用，
  -- 超长前端会省略号截断展示（内容仍完整存库）。
  `note`       VARCHAR(500)     NOT NULL DEFAULT '',
  `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_range` (`start_date`, `end_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
