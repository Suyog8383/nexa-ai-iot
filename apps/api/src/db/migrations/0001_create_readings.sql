CREATE TABLE "readings" (
	"device_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"temperature_c" double precision NOT NULL,
	"humidity_pct" double precision NOT NULL,
	CONSTRAINT "readings_pkey" PRIMARY KEY("device_id","recorded_at"),
	CONSTRAINT "readings_temperature_range" CHECK ("readings"."temperature_c" between -40 and 85),
	CONSTRAINT "readings_humidity_range" CHECK ("readings"."humidity_pct" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;