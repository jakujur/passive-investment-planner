CREATE TYPE "public"."installment_type" AS ENUM('EQUAL', 'DECREASING');--> statement-breakpoint
CREATE TYPE "public"."mortgage_entry_kind" AS ENUM('BANK', 'INSTALLMENT', 'OVERPAYMENT');--> statement-breakpoint
CREATE TYPE "public"."overpayment_mode" AS ENUM('SHORTEN', 'LOWER_INSTALLMENT');--> statement-breakpoint
CREATE TABLE "mortgage_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mortgage_id" uuid NOT NULL,
	"plan_id" uuid,
	"kind" "mortgage_entry_kind" NOT NULL,
	"date" date NOT NULL,
	"amount_minor" bigint,
	"principal_minor" bigint,
	"interest_minor" bigint,
	"interest_saved_minor" bigint,
	"balance_after_minor" bigint NOT NULL,
	"rate_bp" integer NOT NULL,
	"installment_minor" bigint NOT NULL,
	"end_month" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mortgage" ADD COLUMN "installment_type" "installment_type" DEFAULT 'EQUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "mortgage" ADD COLUMN "overpayment_mode" "overpayment_mode" DEFAULT 'SHORTEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "mortgage" ADD COLUMN "end_month" text;--> statement-breakpoint
ALTER TABLE "mortgage_entry" ADD CONSTRAINT "mortgage_entry_mortgage_id_mortgage_id_fk" FOREIGN KEY ("mortgage_id") REFERENCES "public"."mortgage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage_entry" ADD CONSTRAINT "mortgage_entry_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mortgage_entry_mortgage_id_date_index" ON "mortgage_entry" USING btree ("mortgage_id","date");