CREATE TABLE `giveaway_participants` (
	`giveaway_id` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`giveaway_id`) REFERENCES `giveaways`(`uuid`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `giveaway_ping_roles` (
	`roleId` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `giveaway_winners` (
	`giveaway_id` text NOT NULL,
	`user_id` text NOT NULL,
	`claimed_at` integer,
	PRIMARY KEY(`giveaway_id`, `user_id`),
	FOREIGN KEY (`giveaway_id`) REFERENCES `giveaways`(`uuid`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `giveaways` (
	`uuid` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`duration` integer NOT NULL,
	`number_of_winners` integer NOT NULL,
	`description` text,
	`imageUrls` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`creatorId` text NOT NULL,
	`pingRoleId` text,
	`creationTime` integer NOT NULL,
	`startTime` integer,
	`endTime` integer,
	`announcementMessageId` text,
	`winnersMessageId` text,
	`fullyCompletedTime` integer,
	CONSTRAINT "valid_giveaway_status" CHECK("giveaways"."status" IN ('pending', 'active', 'ending', 'completed')),
	CONSTRAINT "started_requires_announcement_start_time_end_time" CHECK("giveaways"."status" NOT IN ('active', 'ending', 'completed') OR ("giveaways"."announcementMessageId" IS NOT NULL AND "giveaways"."startTime" IS NOT NULL AND "giveaways"."endTime" IS NOT NULL)),
	CONSTRAINT "ending_requires_winners" CHECK("giveaways"."status" <> 'ending' OR "giveaways"."winnersMessageId" IS NOT NULL),
	CONSTRAINT "completed_requires_time" CHECK("giveaways"."status" <> 'completed' OR "giveaways"."fullyCompletedTime" IS NOT NULL),
	CONSTRAINT "title_description_images_must_not_be_empty" CHECK(trim("giveaways"."title") <> '' AND trim("giveaways"."description") <> '' AND trim("giveaways"."imageUrls") <> '')
);
