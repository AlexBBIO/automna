CREATE TABLE `announcement_dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`announcement_id` text NOT NULL,
	`dismissed_version` integer NOT NULL,
	`dismissed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`announcement_id`) REFERENCES `announcements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dismissals_user_announcement` ON `announcement_dismissals` (`user_id`,`announcement_id`);--> statement-breakpoint
CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`enabled` integer DEFAULT true,
	`version` integer DEFAULT 1,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_announcements_type` ON `announcements` (`type`);--> statement-breakpoint
CREATE TABLE `email_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sent_at` integer NOT NULL,
	`recipient` text NOT NULL,
	`subject` text
);
--> statement-breakpoint
CREATE INDEX `idx_email_sends_user_sent_at` ON `email_sends` (`user_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `llm_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`current_minute` integer DEFAULT 0 NOT NULL,
	`requests_this_minute` integer DEFAULT 0 NOT NULL,
	`tokens_this_minute` integer DEFAULT 0 NOT NULL,
	`last_reset` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_rate_limits_user_id_unique` ON `llm_rate_limits` (`user_id`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`endpoint` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_microdollars` integer DEFAULT 0 NOT NULL,
	`session_key` text,
	`request_id` text,
	`duration_ms` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_llm_usage_user_timestamp` ON `llm_usage` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `machine_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`machine_id` text NOT NULL,
	`event_type` text NOT NULL,
	`details` text,
	`created_at` integer,
	FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_machine_events_machine_id` ON `machine_events` (`machine_id`);--> statement-breakpoint
CREATE TABLE `machines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`app_name` text,
	`region` text NOT NULL,
	`volume_id` text,
	`status` text DEFAULT 'created',
	`ip_address` text,
	`gateway_token` text,
	`browserbase_context_id` text,
	`agentmail_inbox_id` text,
	`plan` text DEFAULT 'starter',
	`created_at` integer,
	`updated_at` integer,
	`last_active_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `machines_user_id_unique` ON `machines` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_machines_user_id` ON `machines` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_machines_status` ON `machines` (`status`);--> statement-breakpoint
CREATE INDEX `idx_machines_app_name` ON `machines` (`app_name`);--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`iv` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_secrets_user_id` ON `secrets` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_secrets_user_name` ON `secrets` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`name` text,
	`created_at` integer,
	`updated_at` integer
);
