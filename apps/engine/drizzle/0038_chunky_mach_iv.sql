CREATE TABLE `blockchain_networks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`chain_type` text NOT NULL,
	`chain_id` text NOT NULL,
	`chain_name` text NOT NULL,
	`rpc_url` text NOT NULL,
	`explorer_url` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade
);
