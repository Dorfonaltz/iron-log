CREATE TABLE `user_states` (
	`user_id` text PRIMARY KEY NOT NULL,
	`plan_json` text NOT NULL,
	`records_json` text NOT NULL,
	`history_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
