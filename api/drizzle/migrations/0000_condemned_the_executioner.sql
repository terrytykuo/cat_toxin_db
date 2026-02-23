CREATE TABLE `plant_symptoms` (
	`plant_id` integer NOT NULL,
	`symptom_id` integer NOT NULL,
	`severity` text DEFAULT 'moderate' NOT NULL,
	`onset` text,
	`notes` text,
	PRIMARY KEY(`plant_id`, `symptom_id`),
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`symptom_id`) REFERENCES `symptoms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plant_toxic_parts` (
	`plant_id` integer NOT NULL,
	`toxic_part_id` integer NOT NULL,
	PRIMARY KEY(`plant_id`, `toxic_part_id`),
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`toxic_part_id`) REFERENCES `toxic_parts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plant_toxins` (
	`plant_id` integer NOT NULL,
	`toxin_id` integer NOT NULL,
	`concentration_notes` text,
	PRIMARY KEY(`plant_id`, `toxin_id`),
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`toxin_id`) REFERENCES `toxins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plant_treatments` (
	`plant_id` integer NOT NULL,
	`treatment_id` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`notes` text,
	PRIMARY KEY(`plant_id`, `treatment_id`),
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`treatment_id`) REFERENCES `treatments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`common_name` text NOT NULL,
	`scientific_name` text NOT NULL,
	`family` text,
	`description` text,
	`image_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plants_scientific_name_unique` ON `plants` (`scientific_name`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plant_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`accessed_at` text,
	FOREIGN KEY (`plant_id`) REFERENCES `plants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `symptoms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`body_system` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `symptoms_name_unique` ON `symptoms` (`name`);--> statement-breakpoint
CREATE TABLE `toxic_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `toxic_parts_name_unique` ON `toxic_parts` (`name`);--> statement-breakpoint
CREATE TABLE `toxins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`chemical_formula` text,
	`description` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `toxins_name_unique` ON `toxins` (`name`);--> statement-breakpoint
CREATE TABLE `treatments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text
);
