ALTER TABLE "instrument" ADD COLUMN "quote_symbol" text;--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "extra_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "monthly_contribution_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_one_done_per_month" ON "plan" USING btree ("household_id","month") WHERE "plan"."status" = 'DONE';