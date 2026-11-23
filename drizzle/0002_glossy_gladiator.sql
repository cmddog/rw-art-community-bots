CREATE TABLE `giveaway_participants` (
	`giveaway_id` text NOT NULL,
	`user_id` text NOT NULL,
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
	`creatorId` text NOT NULL,
	`creationTime` integer NOT NULL,
	`startTime` integer,
	`announcementMessageId` text,
	`winnersMessageId` text,
	`fullyCompletedTime` integer
);
