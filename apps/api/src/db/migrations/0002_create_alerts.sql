CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"condition" text NOT NULL,
	"threshold" double precision NOT NULL,
	"trigger_value" double precision NOT NULL,
	"triggered_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_events_rule_triggered_at_unique" UNIQUE("rule_id","triggered_at"),
	CONSTRAINT "alert_events_metric_supported" CHECK ("alert_events"."metric" in ('temperature', 'humidity')),
	CONSTRAINT "alert_events_condition_supported" CHECK ("alert_events"."condition" in ('below', 'above')),
	CONSTRAINT "alert_events_trigger_value_range" CHECK ("alert_events"."trigger_value" between -40 and 100),
	CONSTRAINT "alert_events_resolved_after_triggered" CHECK ("alert_events"."resolved_at" >= "alert_events"."triggered_at"),
	CONSTRAINT "alert_events_acknowledged_after_triggered" CHECK ("alert_events"."acknowledged_at" >= "alert_events"."triggered_at")
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"name" text NOT NULL,
	"metric" text NOT NULL,
	"condition" text NOT NULL,
	"threshold" double precision NOT NULL,
	"duration_s" integer NOT NULL,
	"notify_push" boolean NOT NULL,
	"notify_in_app" boolean NOT NULL,
	"notify_sound" boolean NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"origin" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "alert_rules_id_device_unique" UNIQUE("id","device_id"),
	CONSTRAINT "alert_rules_name_length" CHECK (char_length("alert_rules"."name") between 1 and 60),
	CONSTRAINT "alert_rules_metric_supported" CHECK ("alert_rules"."metric" in ('temperature', 'humidity')),
	CONSTRAINT "alert_rules_condition_supported" CHECK ("alert_rules"."condition" in ('below', 'above')),
	CONSTRAINT "alert_rules_threshold_range" CHECK (("alert_rules"."metric" = 'temperature' and "alert_rules"."threshold" between 5 and 40) or ("alert_rules"."metric" = 'humidity' and "alert_rules"."threshold" between 10 and 90)),
	CONSTRAINT "alert_rules_duration_supported" CHECK ("alert_rules"."duration_s" in (0, 300, 900)),
	CONSTRAINT "alert_rules_origin_length" CHECK (char_length("alert_rules"."origin") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_device_fk" FOREIGN KEY ("rule_id","device_id") REFERENCES "public"."alert_rules"("id","device_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_one_open_per_rule" ON "alert_events" USING btree ("rule_id") WHERE "alert_events"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "alert_events_triggered_idx" ON "alert_events" USING btree ("triggered_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alert_events_device_triggered_idx" ON "alert_events" USING btree ("device_id","triggered_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alert_rules_device_idx" ON "alert_rules" USING btree ("device_id");