CREATE TABLE `auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`lock_level` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`subject_id` integer NOT NULL,
	`points_clean` integer NOT NULL,
	`points_warning` integer NOT NULL,
	`points_penalty` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `lessons_date_idx` ON `lessons` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_date_subject_unique` ON `lessons` (`date`,`subject_id`);--> statement-breakpoint
CREATE TABLE `marks` (
	`lesson_id` integer NOT NULL,
	`student_id` integer NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`lesson_id`, `student_id`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "marks_status_valid" CHECK("marks"."status" IN ('clean', 'warning', 'penalty', 'absent'))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`admin_until` integer
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`class_name` text NOT NULL,
	`points_clean` integer NOT NULL,
	`points_warning` integer NOT NULL,
	`points_penalty` integer NOT NULL,
	`school_days` text NOT NULL,
	`sound_on` integer NOT NULL,
	`reports_need_pin` integer NOT NULL,
	`last_backup_at` integer,
	CONSTRAINT "settings_single_row" CHECK("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer NOT NULL,
	`active_from` text NOT NULL,
	`archived_at` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emoji` text NOT NULL,
	`color` text NOT NULL,
	`sort_order` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `teacher` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`pin_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "teacher_single_row" CHECK("teacher"."id" = 1)
);
