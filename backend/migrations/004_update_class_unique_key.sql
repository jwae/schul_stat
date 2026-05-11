ALTER TABLE `class`
  DROP INDEX `uq_jahrgang_parallel`,
  ADD UNIQUE KEY `uq_jahrgang_parallel_class_code` (`jahrgang`, `parallel`, `class_code`);
