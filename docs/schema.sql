-- stats.app_dashboard definition

CREATE TABLE `app_dashboard` (
  `dashboard_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `dashboard_key` varchar(50) NOT NULL,
  `dashboard_name` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`dashboard_id`),
  UNIQUE KEY `dashboard_key` (`dashboard_key`)
) ENGINE=InnoDB AUTO_INCREMENT=560 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- stats.app_group definition

CREATE TABLE `app_group` (
  `group_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `group_name` varchar(50) NOT NULL,
  `group_description` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`group_id`),
  UNIQUE KEY `group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- stats.class definition

CREATE TABLE `class` (
  `class_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `jahrgang` varchar(5) NOT NULL,
  `parallel` char(1) NOT NULL,
  `class_code` varchar(10) NOT NULL,
  `bemerkung` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`class_id`),
  UNIQUE KEY `uq_jahrgang_parallel_class_code` (`jahrgang`,`parallel`,`class_code`)
) ENGINE=InnoDB AUTO_INCREMENT=287 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.education_track definition

CREATE TABLE `education_track` (
  `education_track_id` smallint(6) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(255) NOT NULL,
  `nr` int(11) DEFAULT NULL,
  `sf` varchar(50) DEFAULT NULL,
  `column3` varchar(50) DEFAULT NULL,
  `column4` varchar(50) DEFAULT NULL,
  `column5` varchar(50) DEFAULT NULL,
  `column6` varchar(50) DEFAULT NULL,
  `column7` varchar(50) DEFAULT NULL,
  `column8` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`education_track_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.nation definition

CREATE TABLE `nation` (
  `nation_id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(5) NOT NULL,
  `label` varchar(100) NOT NULL,
  `Staat` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`nation_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=410 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.religion definition

CREATE TABLE `religion` (
  `religion_id` smallint(6) NOT NULL AUTO_INCREMENT,
  `ASD` varchar(32) NOT NULL,
  `name` varchar(255) NOT NULL,
  `id` int(11) DEFAULT NULL,
  PRIMARY KEY (`religion_id`),
  UNIQUE KEY `code` (`ASD`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.school_form definition

CREATE TABLE `school_form` (
  `school_form_id` smallint(6) NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(255) NOT NULL,
  `sf` varchar(2) NOT NULL,
  `sf_kurz` varchar(2) NOT NULL,
  PRIMARY KEY (`school_form_id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.school_source_db definition

CREATE TABLE `school_source_db` (
  `source_id` int(11) NOT NULL AUTO_INCREMENT,
  `source_name` varchar(100) DEFAULT NULL COMMENT 'Freie Bezeichnung der Quelle',
  `db_host` varchar(255) NOT NULL,
  `db_port` int(11) NOT NULL DEFAULT 3306,
  `db_name` varchar(255) NOT NULL,
  `db_user` varchar(255) NOT NULL,
  `db_password_enc` text NOT NULL COMMENT 'Verschluesselt gespeichertes Passwort',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_test_at` datetime DEFAULT NULL,
  `last_test_status` varchar(30) DEFAULT NULL,
  `last_import_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `snr` char(6) NOT NULL,
  PRIMARY KEY (`source_id`),
  UNIQUE KEY `uq_school_source_db_school_new` (`snr`),
  KEY `idx_school_source_db_active` (`is_active`),
  KEY `idx_school_source_db_snr` (`snr`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.sex definition

CREATE TABLE `sex` (
  `sex_id` tinyint(4) NOT NULL,
  `code` varchar(5) NOT NULL,
  `label` varchar(50) NOT NULL,
  PRIMARY KEY (`sex_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.snaps definition

CREATE TABLE `snaps` (
  `snap_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `term_id` bigint(20) NOT NULL,
  `snapshot_date` date NOT NULL,
  `source` varchar(255) DEFAULT NULL,
  `info` varchar(100) DEFAULT NULL,
  `imported_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`snap_id`),
  KEY `idx_snaps_term_date` (`term_id`,`snapshot_date`)
) ENGINE=InnoDB AUTO_INCREMENT=27 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;


-- stats.support_focus definition

CREATE TABLE `support_focus` (
  `support_focus_id` smallint(6) NOT NULL AUTO_INCREMENT,
  `ASD` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`support_focus_id`),
  UNIQUE KEY `code` (`ASD`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.term definition

CREATE TABLE `term` (
  `term_id` int(11) NOT NULL AUTO_INCREMENT,
  `school_year` smallint(6) NOT NULL,
  `term_no` tinyint(4) NOT NULL,
  `label` varchar(10) GENERATED ALWAYS AS (concat(`school_year`,'.',lpad(`term_no`,2,'0'))) STORED,
  PRIMARY KEY (`term_id`),
  UNIQUE KEY `uq_term` (`school_year`,`term_no`)
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.test_source_students definition

CREATE TABLE `test_source_students` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `student_no` int(11) DEFAULT NULL,
  `class_id` int(11) DEFAULT NULL,
  `school_form_id` int(11) DEFAULT NULL,
  `education_track_id` int(11) DEFAULT NULL,
  `ef` tinyint(1) DEFAULT 0,
  `religion_id` int(11) DEFAULT 1,
  `special_needs` tinyint(1) DEFAULT 0,
  `support_focus1_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=34531 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.app_group_dashboard definition

CREATE TABLE `app_group_dashboard` (
  `group_id` int(10) unsigned NOT NULL,
  `dashboard_id` int(10) unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`group_id`,`dashboard_id`),
  KEY `fk_agd_dashboard` (`dashboard_id`),
  CONSTRAINT `fk_agd_dashboard` FOREIGN KEY (`dashboard_id`) REFERENCES `app_dashboard` (`dashboard_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_agd_group` FOREIGN KEY (`group_id`) REFERENCES `app_group` (`group_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- stats.app_user definition

CREATE TABLE `app_user` (
  `user_id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `group_id` int(10) unsigned NOT NULL,
  `user_fullname` varchar(150) DEFAULT NULL COMMENT 'Name des Benutzers',
  `username` varchar(80) NOT NULL COMMENT 'Login Name',
  `email` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_user_group` (`group_id`),
  CONSTRAINT `fk_user_group` FOREIGN KEY (`group_id`) REFERENCES `app_group` (`group_id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- stats.school definition

CREATE TABLE `school` (
  `snr` char(6) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `school_form_id` smallint(6) DEFAULT NULL,
  `is_enabled_for_snapshots` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`snr`),
  UNIQUE KEY `snr` (`snr`),
  KEY `fk_school_school_form` (`school_form_id`),
  KEY `idx_school_enabled_for_snapshots` (`is_enabled_for_snapshots`),
  CONSTRAINT `fk_school_school_form` FOREIGN KEY (`school_form_id`) REFERENCES `school_form` (`school_form_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.school_source_import_run definition

CREATE TABLE `school_source_import_run` (
  `import_run_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `source_id` int(11) NOT NULL,
  `started_at` datetime NOT NULL DEFAULT current_timestamp(),
  `finished_at` datetime DEFAULT NULL,
  `status` varchar(30) NOT NULL COMMENT 'running, success, warning, error',
  `message` text DEFAULT NULL,
  `snapshot_date` date DEFAULT NULL,
  `inserted_students` int(11) NOT NULL DEFAULT 0,
  `inserted_teachers` int(11) NOT NULL DEFAULT 0,
  `inserted_classes` int(11) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`import_run_id`),
  KEY `fk_school_source_import_run_source` (`source_id`),
  KEY `idx_school_source_import_run_status` (`status`),
  KEY `idx_school_source_import_run_started_at` (`started_at`),
  CONSTRAINT `fk_school_source_import_run_source` FOREIGN KEY (`source_id`) REFERENCES `school_source_db` (`source_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.snapshot definition

CREATE TABLE `snapshot` (
  `snapshot_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `snap_id` bigint(20) unsigned NOT NULL,
  `term_id` int(11) NOT NULL,
  `snapshot_date` date NOT NULL,
  `imported_at` datetime NOT NULL DEFAULT current_timestamp(),
  `source` varchar(255) DEFAULT NULL,
  `checksum` char(64) DEFAULT NULL,
  `snr` char(6) NOT NULL,
  `info` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`snapshot_id`),
  UNIQUE KEY `uq_snapshot_new` (`snr`,`term_id`,`snapshot_date`,`source`),
  KEY `idx_snapshot_new` (`snr`,`term_id`,`snapshot_date`),
  KEY `idx_snapshot_term_date_snr` (`term_id`,`snapshot_date`,`snr`),
  KEY `idx_snapshot_snap_id` (`snap_id`),
  CONSTRAINT `fk_snapshot_school_snr` FOREIGN KEY (`snr`) REFERENCES `school` (`snr`),
  CONSTRAINT `fk_snapshot_snap_id` FOREIGN KEY (`snap_id`) REFERENCES `snaps` (`snap_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_snapshot_term` FOREIGN KEY (`term_id`) REFERENCES `term` (`term_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1564 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.snapshot_student definition

CREATE TABLE `snapshot_student` (
  `snapshot_id` bigint(20) NOT NULL,
  `student_no` int(11) NOT NULL,
  `class_id` bigint(20) NOT NULL,
  `school_form_id` smallint(6) DEFAULT NULL COMMENT 'Schulform',
  `education_track_id` smallint(6) DEFAULT NULL COMMENT 'Bildungsgang',
  `ef` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Erstförderung',
  `religion_id` smallint(6) DEFAULT NULL COMMENT 'Konfession',
  `special_needs` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Förderbedarf',
  `support_focus1_id` smallint(6) DEFAULT NULL COMMENT 'FÖ1',
  `support_focus2_id` smallint(6) DEFAULT NULL COMMENT 'FÖ2',
  `target_different` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Zieldifferent',
  `sex_id` tinyint(4) DEFAULT NULL,
  `nation_id` int(11) DEFAULT NULL,
  `migration` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`snapshot_id`,`class_id`,`student_no`),
  KEY `idx_ss_class` (`snapshot_id`,`class_id`),
  KEY `idx_ss_filters` (`snapshot_id`,`school_form_id`,`education_track_id`,`ef`,`special_needs`,`target_different`),
  KEY `fk_ss_class` (`class_id`),
  KEY `fk_ss_school_form` (`school_form_id`),
  KEY `fk_ss_education_track` (`education_track_id`),
  KEY `fk_ss_religion` (`religion_id`),
  KEY `fk_ss_focus1` (`support_focus1_id`),
  KEY `fk_ss_focus2` (`support_focus2_id`),
  KEY `idx_ss_snapshot_special` (`snapshot_id`,`special_needs`),
  KEY `idx_snapshot_student_sex` (`sex_id`),
  KEY `fk_ss_nation` (`nation_id`),
  KEY `idx_snapshot_student_migration` (`migration`),
  CONSTRAINT `fk_ss_class` FOREIGN KEY (`class_id`) REFERENCES `class` (`class_id`),
  CONSTRAINT `fk_ss_education_track` FOREIGN KEY (`education_track_id`) REFERENCES `education_track` (`education_track_id`),
  CONSTRAINT `fk_ss_focus1` FOREIGN KEY (`support_focus1_id`) REFERENCES `support_focus` (`support_focus_id`),
  CONSTRAINT `fk_ss_focus2` FOREIGN KEY (`support_focus2_id`) REFERENCES `support_focus` (`support_focus_id`),
  CONSTRAINT `fk_ss_nation` FOREIGN KEY (`nation_id`) REFERENCES `nation` (`nation_id`),
  CONSTRAINT `fk_ss_religion` FOREIGN KEY (`religion_id`) REFERENCES `religion` (`religion_id`),
  CONSTRAINT `fk_ss_school_form` FOREIGN KEY (`school_form_id`) REFERENCES `school_form` (`school_form_id`),
  CONSTRAINT `fk_ss_sex` FOREIGN KEY (`sex_id`) REFERENCES `sex` (`sex_id`),
  CONSTRAINT `fk_ss_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `snapshot` (`snapshot_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_target_different` CHECK (`target_different` in (0,1)),
  CONSTRAINT `chk_ef` CHECK (`ef` in (0,1)),
  CONSTRAINT `chk_special_needs` CHECK (`special_needs` in (0,1)),
  CONSTRAINT `chk_migration` CHECK (`migration` in (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.snapshot_teacher definition

CREATE TABLE `snapshot_teacher` (
  `snapshot_teacher_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `snapshot_id` bigint(20) NOT NULL,
  `teacher_no` int(11) NOT NULL,
  `sex_id` tinyint(4) NOT NULL,
  `nation_id` int(11) NOT NULL,
  `city` varchar(255) DEFAULT NULL,
  `age` tinyint(4) NOT NULL,
  PRIMARY KEY (`snapshot_teacher_id`),
  UNIQUE KEY `uq_snapshot_teacher_no` (`snapshot_id`,`teacher_no`),
  KEY `idx_st_snapshot` (`snapshot_id`),
  KEY `idx_st_sex` (`sex_id`),
  KEY `idx_st_nation` (`nation_id`),
  CONSTRAINT `fk_st_nation` FOREIGN KEY (`nation_id`) REFERENCES `nation` (`nation_id`),
  CONSTRAINT `fk_st_sex` FOREIGN KEY (`sex_id`) REFERENCES `sex` (`sex_id`),
  CONSTRAINT `fk_st_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `snapshot` (`snapshot_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9163 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- stats.school_source_import_log definition

CREATE TABLE `school_source_import_log` (
  `import_log_id` bigint(20) NOT NULL AUTO_INCREMENT,
  `import_run_id` bigint(20) NOT NULL,
  `log_level` varchar(20) NOT NULL COMMENT 'info, warning, error',
  `log_message` text NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`import_log_id`),
  KEY `fk_school_source_import_log_run` (`import_run_id`),
  CONSTRAINT `fk_school_source_import_log_run` FOREIGN KEY (`import_run_id`) REFERENCES `school_source_import_run` (`import_run_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
