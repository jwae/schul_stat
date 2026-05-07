-- Convert snapshot.snap_id values from UUID-style strings to sequential numeric strings.
-- Keep column type as CHAR so existing API comparisons keep working unchanged.

CREATE TEMPORARY TABLE `tmp_snapshot_snap_seq` (
  `snap_no` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `term_id` BIGINT NOT NULL,
  `snapshot_date` DATE NOT NULL,
  `source_hash` BINARY(16) NOT NULL,
  PRIMARY KEY (`snap_no`),
  UNIQUE KEY `uq_snapshot_group` (`term_id`, `snapshot_date`, `source_hash`)
) ENGINE=InnoDB;

INSERT INTO `tmp_snapshot_snap_seq` (`term_id`, `snapshot_date`, `source_hash`)
SELECT
  sp.`term_id`,
  sp.`snapshot_date`,
  UNHEX(MD5(COALESCE(TRIM(sp.`source`), ''))) AS `source_hash`
FROM `snapshot` sp
GROUP BY
  sp.`term_id`,
  sp.`snapshot_date`,
  UNHEX(MD5(COALESCE(TRIM(sp.`source`), '')))
ORDER BY
  sp.`term_id`,
  sp.`snapshot_date`,
  `source_hash`;

UPDATE `snapshot` sp
JOIN `tmp_snapshot_snap_seq` t
  ON t.`term_id` = sp.`term_id`
 AND t.`snapshot_date` = sp.`snapshot_date`
 AND t.`source_hash` = UNHEX(MD5(COALESCE(TRIM(sp.`source`), '')))
SET sp.`snap_id` = CAST(t.`snap_no` AS CHAR);

DROP TEMPORARY TABLE `tmp_snapshot_snap_seq`;

-- Sequence table for generating future snap_id values.
CREATE TABLE IF NOT EXISTS `snapshot_run_id_seq` (
  `seq_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`seq_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @max_snap_no := (
  SELECT COALESCE(MAX(CAST(TRIM(COALESCE(`snap_id`, '0')) AS UNSIGNED)), 0)
  FROM `snapshot`
);
SET @next_snap_no := @max_snap_no + 1;
SET @sql_auto_inc := CONCAT('ALTER TABLE `snapshot_run_id_seq` AUTO_INCREMENT = ', @next_snap_no);
PREPARE stmt FROM @sql_auto_inc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

