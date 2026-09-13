CREATE TABLE "ss_business_deleted_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ss_business_projects" ADD COLUMN "deleted_at" timestamp with time zone;