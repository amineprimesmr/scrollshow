CREATE TABLE "ss_business_adjustments" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_adjustments_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_clicks" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_clicks_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_connections" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_connections_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_costs" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_costs_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_events" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_events_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_experiments" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_experiments_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_identities" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_identities_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_links" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_links_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_projects" (
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ss_business_projects_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_publications" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_publications_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_settings" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_settings_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_tracking_keys" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_tracking_keys_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "ss_business_transactions" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"natural_key" text NOT NULL,
	"lookup_key" text,
	"connection_id" text,
	"currency" text,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "ss_business_transactions_user_id_project_id_id_pk" PRIMARY KEY("user_id","project_id","id")
);
--> statement-breakpoint
ALTER TABLE "ss_business_adjustments" ADD CONSTRAINT "ss_business_adjustments_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_clicks" ADD CONSTRAINT "ss_business_clicks_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_connections" ADD CONSTRAINT "ss_business_connections_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_costs" ADD CONSTRAINT "ss_business_costs_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_events" ADD CONSTRAINT "ss_business_events_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_experiments" ADD CONSTRAINT "ss_business_experiments_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_identities" ADD CONSTRAINT "ss_business_identities_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_links" ADD CONSTRAINT "ss_business_links_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_publications" ADD CONSTRAINT "ss_business_publications_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_settings" ADD CONSTRAINT "ss_business_settings_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_tracking_keys" ADD CONSTRAINT "ss_business_tracking_keys_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ss_business_transactions" ADD CONSTRAINT "ss_business_transactions_user_id_project_id_ss_business_projects_user_id_project_id_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."ss_business_projects"("user_id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_adjustments_natural" ON "ss_business_adjustments" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_adjustments_lookup" ON "ss_business_adjustments" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_adjustments_period" ON "ss_business_adjustments" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_adjustments_connection" ON "ss_business_adjustments" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_clicks_natural" ON "ss_business_clicks" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_clicks_lookup" ON "ss_business_clicks" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_clicks_period" ON "ss_business_clicks" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_clicks_connection" ON "ss_business_clicks" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_connections_natural" ON "ss_business_connections" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_connections_lookup" ON "ss_business_connections" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_connections_period" ON "ss_business_connections" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_connections_connection" ON "ss_business_connections" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_costs_natural" ON "ss_business_costs" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_costs_lookup" ON "ss_business_costs" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_costs_period" ON "ss_business_costs" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_costs_connection" ON "ss_business_costs" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_events_natural" ON "ss_business_events" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_events_lookup" ON "ss_business_events" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_events_period" ON "ss_business_events" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_events_connection" ON "ss_business_events" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_experiments_natural" ON "ss_business_experiments" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_experiments_lookup" ON "ss_business_experiments" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_experiments_period" ON "ss_business_experiments" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_experiments_connection" ON "ss_business_experiments" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_identities_natural" ON "ss_business_identities" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_identities_lookup" ON "ss_business_identities" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_identities_period" ON "ss_business_identities" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_identities_connection" ON "ss_business_identities" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_links_natural" ON "ss_business_links" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_links_lookup" ON "ss_business_links" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_links_period" ON "ss_business_links" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_links_connection" ON "ss_business_links" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_publications_natural" ON "ss_business_publications" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_publications_lookup" ON "ss_business_publications" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_publications_period" ON "ss_business_publications" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_publications_connection" ON "ss_business_publications" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_settings_natural" ON "ss_business_settings" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_settings_lookup" ON "ss_business_settings" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_settings_period" ON "ss_business_settings" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_settings_connection" ON "ss_business_settings" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_tracking_keys_natural" ON "ss_business_tracking_keys" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_tracking_keys_lookup" ON "ss_business_tracking_keys" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_tracking_keys_period" ON "ss_business_tracking_keys" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_tracking_keys_connection" ON "ss_business_tracking_keys" USING btree ("user_id","project_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_transactions_natural" ON "ss_business_transactions" USING btree ("user_id","project_id","natural_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ss_business_transactions_lookup" ON "ss_business_transactions" USING btree ("lookup_key");--> statement-breakpoint
CREATE INDEX "ss_business_transactions_period" ON "ss_business_transactions" USING btree ("user_id","project_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ss_business_transactions_connection" ON "ss_business_transactions" USING btree ("user_id","project_id","connection_id");