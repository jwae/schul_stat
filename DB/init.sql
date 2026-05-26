CREATE DATABASE IF NOT EXISTS `stats`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'stats_user'@'%' IDENTIFIED BY 'stats_password';
GRANT ALL PRIVILEGES ON `stats`.* TO 'stats_user'@'%';
FLUSH PRIVILEGES;

USE `stats`;

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
  `plz` varchar(20) DEFAULT NULL,
  `ort` varchar(100) DEFAULT NULL,
  `strasse` varchar(255) DEFAULT NULL,
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
  `ef` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Erstfoerderung',
  `religion_id` smallint(6) DEFAULT NULL COMMENT 'Konfession',
  `special_needs` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Foerderbedarf',
  `support_focus1_id` smallint(6) DEFAULT NULL COMMENT 'FO1',
  `support_focus2_id` smallint(6) DEFAULT NULL COMMENT 'FO2',
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


-- -----------------------------------------------------
-- Stammdaten / Kataloge
-- -----------------------------------------------------
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO `app_dashboard` VALUES
(1,'uebersicht','Übersicht',1,'2026-03-06 18:25:39'),
(2,'schuelerstaerken','Schülerstärken',1,'2026-03-06 18:25:39'),
(3,'klassenstaerken','Klassenstärken',1,'2026-03-06 18:25:39'),
(4,'daz','DAZ',1,'2026-03-06 18:25:39'),
(5,'app-einstellungen','Einstellungen',1,'2026-03-06 19:24:28'),
(6,'db-einstellungen','Datenbanken',1,'2026-03-06 19:25:46'),
(7,'lehrerdaten','Lehrerdaten',1,'2026-04-18 19:49:39'),
(768,'schuelerzahlen','Schülerzahlen',1,'2026-05-11 15:11:51');

INSERT INTO `app_group` VALUES
(1,'admin','Systemadministrator',1,'2026-03-06 17:45:14'),
(2,'user','Standardbenutzer',1,'2026-03-06 17:45:14'),
(3,'editor_daz','Kann Inhalte bearbeiten',1,'2026-03-06 17:45:14'),
(12,'editor_L','Testgruppe',1,'2026-03-08 20:29:56');

INSERT INTO `app_group_dashboard` VALUES
(1,1,'2026-05-11 15:12:51'),
(1,2,'2026-05-11 15:12:51'),
(1,3,'2026-05-11 15:12:51'),
(1,4,'2026-05-11 15:12:51'),
(1,5,'2026-05-11 15:12:51'),
(1,6,'2026-05-11 15:12:51'),
(1,7,'2026-05-11 15:12:51'),
(1,768,'2026-05-11 15:12:51'),
(2,1,'2026-05-11 15:12:26'),
(2,768,'2026-05-11 15:12:26'),
(3,4,'2026-05-11 15:12:40'),
(12,7,'2026-05-11 15:12:32');

INSERT INTO `app_user` VALUES
(10,1,'Administrator','admin',NULL,'$2a$10$f96qA8oo/03zn1LKVIPtOuIGUxhhOebwsLp/jGEemF7QQLUGsRbm.',1,'2026-03-07 20:48:28','2026-05-14 12:09:41','2026-05-14 12:09:41');

INSERT INTO `class` VALUES
(300,'05','A','05A','05A'),
(301,'05','B','05B','05B'),
(302,'05','C','05C','05C'),
(303,'06','A','06A','06A'),
(304,'06','B','06B','06B'),
(305,'06','C','06C','06C'),
(306,'07','A','07A','07A'),
(307,'07','B','07B','07B'),
(308,'07','C','07C','07C'),
(309,'08','A','08A','08A'),
(310,'08','B','08B','08B'),
(311,'08','C','08C','08C'),
(312,'09','A','09A','09A'),
(313,'09','B','09B','09B'),
(314,'09','C','09C','09C'),
(315,'EF','','EF','EF'),
(316,'08','X','08X','IKA'),
(317,'08','Y','08Y','IKB'),
(318,'08','Z','08Z','IKC'),
(319,'Q1','','Q1','Q1'),
(320,'Q2','','Q2','Q2'),
(323,'03','C','03C','03C'),
(324,'04','C','04C','04C'),
(325,'01','A','01A','1A'),
(326,'01','B','01B','1B'),
(327,'02','A','02A','2A'),
(328,'02','B','02B','2B'),
(329,'03','A','03A','3A'),
(330,'03','B','03B','3B'),
(331,'04','A','04A','4A'),
(332,'04','B','04B','4B');

INSERT INTO `education_track` VALUES
(1,'2','Grundschule',NULL,'GS',NULL,NULL,NULL,NULL,NULL,NULL),
(2,'4','Hauptschule',NULL,'H',NULL,NULL,NULL,NULL,NULL,NULL),
(3,'6','Volksschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(4,'8','Förderschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(5,'10','Realschule',NULL,'RS',NULL,NULL,NULL,NULL,NULL,NULL),
(6,'13','Primusschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(7,'14','Sekundarschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(8,'15','Gesamtschule',NULL,'GE',NULL,NULL,NULL,NULL,NULL,NULL),
(9,'16','Gemeinschaftsschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(10,'17','Freie Waldorfschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(11,'18','Hiberniaschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(12,'19','Freie Waldorfförderschule',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
(13,'20','Gymnasium',NULL,'GY',NULL,NULL,NULL,NULL,NULL,NULL);

INSERT INTO `nation` VALUES
(207,'DEU','Deutschland','Deutschland'),
(208,'TUR','Türkei','Türkei'),
(209,'ALB','Albanien','Albanien'),
(210,'ROU','Rumänien','Rumänien'),
(211,'5','Finnland','Finnland'),
(212,'MKD','Nordmazedonien','Nordmazedonien'),
(213,'7','Malta','Malta'),
(214,'MDA','Moldawien','Moldawien'),
(215,'9','Monaco','Monaco'),
(216,'NLD','Niederlande','Niederlande'),
(217,'11','Norwegen','Norwegen'),
(218,'AUT','Österreich','Österreich'),
(219,'13','Tschechien','Tschechien'),
(220,'POR','Portugal','Portugal'),
(221,'LIE','Liechtenstein','Liechtenstein'),
(222,'16','Slowakische Republik','Slowakische Republik'),
(223,'17','San Marino','San Marino'),
(224,'SWE','Schweden','Schweden'),
(225,'CHE','Schweiz','Schweiz'),
(226,'RUS','Russland','Russland'),
(227,'SPA','Spanien','Spanien'),
(228,'BGR','Bulgarien','Bulgarien'),
(229,'POL','Polen','Polen'),
(230,'SVN','Slowenien','Slowenien'),
(231,'25','Bosnien-Herzegowina','Bosnien-Herzegowina'),
(232,'26','Andorra','Andorra'),
(233,'BEL','Belgien','Belgien'),
(234,'DNK','Dänemark','Dänemark'),
(235,'29','Estland','Estland'),
(236,'SRB','Serbien','Serbien'),
(237,'XXK','Kosovo','Kosovo'),
(238,'LUX','Luxemburg','Luxemburg'),
(239,'HRV','Kroatien','Kroatien'),
(240,'LTU','Litauen','Litauen'),
(241,'GRC','Griechenland','Griechenland'),
(242,'IRL','Irland','Irland'),
(243,'ISL','Island','Island'),
(244,'ITA','Italien','Italien'),
(245,'LVA','Lettland','Lettland'),
(246,'HUN','Ungarn','Ungarn'),
(247,'FRA','Frankreich','Frankreich'),
(248,'43','Korea, Republik (früher Südkorea)','Korea, Republik (früher Südkorea)'),
(249,'IND','Indien','Indien'),
(250,'45','Indonesien','Indonesien'),
(251,'IRN','Iran','Iran'),
(252,'ISR','Israel','Israel'),
(253,'JPN','Japan','Japan'),
(254,'JOR','Jordanien','Jordanien'),
(255,'LBN','Libanon','Libanon'),
(256,'51','Philippinen','Philippinen'),
(257,'52','Sri Lanka','Sri Lanka'),
(258,'SYR','Syrien','Syrien'),
(259,'54','Thailand','Thailand'),
(260,'55','Übriges Asien','Übriges Asien'),
(261,'56','Australien','Australien'),
(262,'57','Neuseeland','Neuseeland'),
(263,'58','Übriges Australien / Ozeanien','Übriges Australien / Ozeanien'),
(264,'59','Staatenlos','Staatenlos'),
(265,'PAK','Pakistan','Pakistan'),
(266,'TUN','Tunesien','Tunesien'),
(267,'UKR','Ukraine','Ukraine'),
(268,'GBR','Großbritannien und Nordirland','Großbritannien und Nordirland'),
(269,'64','Weißrussland','Weißrussland'),
(270,'65','Zypern','Zypern'),
(271,'66','Übriges Europa','Übriges Europa'),
(272,'ALG','Algerien','Algerien'),
(273,'68','Äthiopien','Äthiopien'),
(274,'69','Korea, Dem. Volksrepublik (früher Nordkorea)','Korea, Dem. Volksrepublik (früher Nordkorea)'),
(275,'MAR','Marokko','Marokko'),
(276,'71','Vietnam','Vietnam'),
(277,'72','Übriges Afrika','Übriges Afrika'),
(278,'BRA','Brasilien','Brasilien'),
(279,'74','Chile','Chile'),
(280,'CAN','Kanada','Kanada'),
(281,'USA','Vereinigte Staaten','Vereinigte Staaten'),
(282,'77','Übriges Amerika','Übriges Amerika'),
(283,'AFG','Afghanistan','Afghanistan'),
(284,'79','Ungeklärt','Ungeklärt'),
(285,'GHA','Ghana','Ghana'),
(286,'81','Madagaskar','Madagaskar'),
(287,'82','Cabo Verde','Cabo Verde'),
(288,'83','Kenia','Kenia'),
(289,'84','Komoren','Komoren'),
(290,'COD','Kongo DR','Kongo DR'),
(291,'COG','Kongo VR','Kongo VR'),
(292,'87','Mauretanien','Mauretanien'),
(293,'LBY','Libyen','Libyen'),
(294,'89','Elfenbeinküste','Elfenbeinküste'),
(295,'90','Mali','Mali'),
(296,'91','Liberia','Liberia'),
(297,'92','Gambia','Gambia'),
(298,'93','Gabun','Gabun'),
(299,'94','Nigeria','Nigeria'),
(300,'95','Dschibuti','Dschibuti'),
(301,'96','Benin','Benin'),
(302,'97','Botsuana','Botsuana'),
(303,'98','Lesotho','Lesotho'),
(304,'99','Eritrea','Eritrea'),
(305,'100','Angola','Angola'),
(306,'101','Vatikan','Vatikan'),
(307,'103','Niger','Niger'),
(308,'104','Simbabwe','Simbabwe'),
(309,'105','Brunei','Brunei'),
(310,'106','Nepal','Nepal'),
(311,'107','Mongolei','Mongolei'),
(312,'108','Oman','Oman'),
(313,'109','Malediven','Malediven'),
(314,'KGZ','Kirgisistan','Kirgisistan'),
(315,'111','Laos','Laos'),
(316,'112','Kuwait','Kuwait'),
(317,'113','Katar','Katar'),
(318,'114','Kambodscha','Kambodscha'),
(319,'KAZ','Kasachstan','Kasachstan'),
(320,'116','St. Lucia','St. Lucia'),
(321,'117','Georgien','Georgien'),
(322,'118','Vereinigte Arabischen Emirate','Vereinigte Arabischen Emirate'),
(323,'119','Myanmar','Myanmar'),
(324,'120','Bhutan','Bhutan'),
(325,'AZE','Aserbaidschan','Aserbaidschan'),
(326,'122','Bahrain','Bahrain'),
(327,'123','Armenien','Armenien'),
(328,'YEM','Jemen','Jemen'),
(329,'125','Trinidad und Tobago','Trinidad und Tobago'),
(330,'126','St. Kitts und Nevis','St. Kitts und Nevis'),
(331,'127','St. Vincent','St. Vincent'),
(332,'128','Mauritius','Mauritius'),
(333,'IRQ','Irak','Irak'),
(334,'130','Cookinseln','Cookinseln'),
(335,'131','Ohne Angabe','Ohne Angabe'),
(336,'132','Mikronesien','Mikronesien'),
(337,'133','Marshall-Inseln','Marshall-Inseln'),
(338,'134','Samoa','Samoa'),
(339,'135','Tonga','Tonga'),
(340,'136','Tuvalu','Tuvalu'),
(341,'137','Papua-Neuguinea','Papua-Neuguinea'),
(342,'138','Palau','Palau'),
(343,'139','Niuea','Niuea'),
(344,'140','Vanuatu','Vanuatu'),
(345,'BGD','Bangladesch','Bangladesch'),
(346,'142','Kiribati','Kiribati'),
(347,'143','Taiwan','Taiwan'),
(348,'144','Fidschi','Fidschi'),
(349,'145','Salomonen','Salomonen'),
(350,'146','Timor-Leste','Timor-Leste'),
(351,'147','Malaysia','Malaysia'),
(352,'148','China','China'),
(353,'149','Usbekistan','Usbekistan'),
(354,'150','Singapur','Singapur'),
(355,'151','Saudi-Arabien','Saudi-Arabien'),
(356,'152','Turkmenistan','Turkmenistan'),
(357,'153','Tadschikistan','Tadschikistan'),
(358,'154','Uruguay','Uruguay'),
(359,'155','Nauru','Nauru'),
(360,'156','Senegal','Senegal'),
(361,'157','Zentralafrikanische Republik','Zentralafrikanische Republik'),
(362,'EGY','Ägypten','Ägypten'),
(363,'159','Uganda','Uganda'),
(364,'160','Tschad','Tschad'),
(365,'161','Togo','Togo'),
(366,'162','Tansania','Tansania'),
(367,'163','Swasiland','Swasiland'),
(368,'165','Äquatorial-Guinea','Äquatorial-Guinea'),
(369,'SOM','Somalia','Somalia'),
(370,'167','Venezuela','Venezuela'),
(371,'168','Seychellen','Seychellen'),
(372,'169','Barbados','Barbados'),
(373,'170','Sâo-Tomé','Sâo-Tomé'),
(374,'171','Namibia','Namibia'),
(375,'172','Ruanda','Ruanda'),
(376,'173','Südafrika','Südafrika'),
(377,'174','Kamerun','Kamerun'),
(378,'GIN','Guinea','Guinea'),
(379,'176','Guinea-Bissau','Guinea-Bissau'),
(380,'177','Burkina-Faso','Burkina-Faso'),
(381,'178','Sambia','Sambia'),
(382,'179','Malawi','Malawi'),
(383,'180','Sierra Leone','Sierra Leone'),
(384,'181','Grenada','Grenada'),
(385,'182','Surinam','Surinam'),
(386,'183','Peru','Peru'),
(387,'184','Paraguay','Paraguay'),
(388,'185','Panama','Panama'),
(389,'186','Jamaica','Jamaica'),
(390,'187','Nicaragua','Nicaragua'),
(391,'188','Mexiko','Mexiko'),
(392,'CUB','Kuba','Kuba'),
(393,'190','Kolumbien','Kolumbien'),
(394,'191','Honduras','Honduras'),
(395,'192','Burundi','Burundi'),
(396,'193','Guatemala','Guatemala'),
(397,'194','Antigua','Antigua'),
(398,'195','El Salvador','El Salvador'),
(399,'196','Ecuador','Ecuador'),
(400,'197','Dominikanische Republik','Dominikanische Republik'),
(401,'198','Costa Rica','Costa Rica'),
(402,'199','Dominica','Dominica'),
(403,'200','Belize','Belize'),
(404,'201','Guayana','Guayana'),
(405,'202','Bolivien','Bolivien'),
(406,'203','Bahamas','Bahamas'),
(407,'204','Argentinien','Argentinien'),
(408,'205','Mosambik','Mosambik'),
(409,'206','Haiti','Haiti');

INSERT INTO `religion` VALUES
(1,'AR','alevitisch',1),
(2,'XR','andere Religionen',2),
(5,'XO','sonstige orthodoxe',5),
(6,'ER','evangelisch',6),
(7,'OR','griechisch-orthodox',7),
(9,'IR','islamisch',9),
(11,'KR','katholisch',11),
(13,'OH','ohne Bekenntnis',13),
(20,'SO','syr.orth.',20),
(21,'HR','jüdisch',21),
(22,'ME','mennonitisch',22);

INSERT INTO `school_form` VALUES
(1,'02','Grundschule','G','GS'),
(2,'04','Hauptschule','H','HS'),
(3,'06','Volksschule','V','VS'),
(4,'08','Förderschule','S','FÖ'),
(5,'10','Realschule','R','RS'),
(6,'13','Primusschule','PS','PS'),
(7,'14','Sekundarschule','SK','SK'),
(8,'15','Gesamtschule','GE','GE'),
(9,'16','Gemeinschaftsschule','GM','GM'),
(10,'17','Freie Waldorfschule','FW','FW'),
(11,'18','Hiberniaschule','FW','FW'),
(12,'19','Freie Waldorfförderschule','FW','FW'),
(13,'20','Gymnasium','GY','GY'),
(14,'25','Weiterbildungskolleg','WB','WB'),
(15,'30','Berufskolleg','BK','BK'),
(16,'83','Schule für Kranke','S','S');

INSERT INTO `school` (`snr`, `name`, `city`, `plz`, `ort`, `strasse`, `school_form_id`, `is_enabled_for_snapshots`) VALUES
('100011','Städt. Gesamtschule','Haan','42781','Haan','Walder Straße 15',8,0),
('100012','Städt. Gemeinschaftsgrundschule','Leverkusen','51373','Leverkusen','Bismarckstraße 200',1,0),
('100014','Kolibri-Schule','Herne','44625','Herne','Kolibriweg 8',1,0),
('100015','Städt. Wim-Wenders-Gymnasium','Düsseldorf','40227','Düsseldorf','Schmiedestraße 25',13,0),
('100016','Kupferstädter Gesamtschule','Stolberg (Rhld.)','52222','Stolberg (Rhld.)','Kupfermeisterstraße 12',8,0),
('100017','Städt. Gem. Grundschule','Hürth','50354','Hürth','Bonnstraße 172',1,0),
('100019','Joseph Beuys Gesamtschule','Kleve','47533','Kleve','Hoffmannallee 15',8,0),
('100052','Comenius-Gesamtschule','Neuss','41460','Neuss','Weberstraße 90',8,0),
('100128','Grundschule Vulkanstraße','Krefeld','47803','Krefeld','Vulkanstraße 10',1,0),
('100137','Kompass-Grundschule','Krefeld','47809','Krefeld','Kompassweg 4',1,0),
('100157','Grundschule Westparkstraße','Krefeld','47803','Krefeld','Westparkstraße 21',1,0),
('100223','Grundschule Am Ringerberg','Mönchengladbach','41065','Mönchengladbach','Am Ringerberg 12',1,0),
('100226','Grundschule Wilhelm-Strauß-Straße','Mönchengladbach','41236','Mönchengladbach','Wilhelm-Strauß-Straße 18',1,0),
('102880','Schule an Haus Rath','Krefeld','47802','Krefeld','Rather Straße 100',1,0);

INSERT INTO `sex` VALUES
(3,'3','männlich'),
(4,'4','weiblich'),
(5,'5','divers'),
(6,'6','ohne Angabe');

INSERT INTO `support_focus` VALUES
(1,'GH','Hören und Kommunikation (Gehörlose)'),
(2,'KB','Körperliche und motorische Entwicklung'),
(3,'LB','Lernen'),
(4,'SH','Sehen (Sehbehinderte)'),
(5,'EZ','Emotionale und soziale Entwicklung'),
(6,'SB','Sprache'),
(7,'**','kein Förderschwerpunkt'),
(8,'BL','Sehen (Blinde)'),
(9,'GB','Geistige Entwicklung'),
(11,'SG','Hören und Kommunikation (schwerhörige)');

INSERT INTO `term` (`term_id`, `school_year`, `term_no`) VALUES
(43,2019,1),
(44,2019,2),
(41,2020,1),
(42,2020,2),
(39,2021,1),
(40,2021,2),
(37,2022,1),
(38,2022,2),
(35,2023,1),
(36,2023,2),
(1,2024,1),
(2,2024,2),
(3,2025,1),
(4,2025,2),
(5,2026,1),
(6,2026,2),
(7,2027,1),
(8,2027,2),
(9,2028,1),
(10,2028,2),
(11,2029,1),
(12,2029,2),
(33,2030,1),
(34,2030,2);
