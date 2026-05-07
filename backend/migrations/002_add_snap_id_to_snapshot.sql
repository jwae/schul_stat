-- Add logical snapshot run identifier shared across schools of the same snapshot run.
ALTER TABLE `snapshot`
  ADD COLUMN `snap_id` CHAR(36) NULL AFTER `snapshot_id`;

-- Backfill: one shared snap_id for each existing snapshot group
-- (term_id + snapshot_date + source).
CREATE TEMPORARY TABLE `tmp_snapshot_snap_ids` (
  `term_id` BIGINT NOT NULL,
  `snapshot_date` DATE NOT NULL,
  `source_hash` BINARY(16) NOT NULL,
  `snap_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`term_id`, `snapshot_date`, `source_hash`)
) ENGINE=InnoDB;

INSERT INTO `tmp_snapshot_snap_ids` (`term_id`, `snapshot_date`, `source_hash`, `snap_id`)
SELECT
  sp.`term_id`,
  sp.`snapshot_date`,
  UNHEX(MD5(COALESCE(TRIM(sp.`source`), ''))) AS `source_hash`,
  UUID() AS `snap_id`
FROM `snapshot` sp
GROUP BY
  sp.`term_id`,
  sp.`snapshot_date`,
  UNHEX(MD5(COALESCE(TRIM(sp.`source`), '')));

UPDATE `snapshot` sp
JOIN `tmp_snapshot_snap_ids` t
  ON t.`term_id` = sp.`term_id`
 AND t.`snapshot_date` = sp.`snapshot_date`
 AND t.`source_hash` = UNHEX(MD5(COALESCE(TRIM(sp.`source`), '')))
SET sp.`snap_id` = t.`snap_id`;

DROP TEMPORARY TABLE `tmp_snapshot_snap_ids`;

ALTER TABLE `snapshot`
  MODIFY COLUMN `snap_id` CHAR(36) NOT NULL;

ALTER TABLE `snapshot`
  ADD KEY `idx_snapshot_snap_id` (`snap_id`);
