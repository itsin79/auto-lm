CREATE TABLE `inspections` (
	`owner_id` text NOT NULL,
	`id` text NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`search` text NOT NULL,
	`updated_at` text NOT NULL,
	`record` text NOT NULL,
	PRIMARY KEY(`owner_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inspections_request` ON `inspections` (`owner_id`,`request_id`);