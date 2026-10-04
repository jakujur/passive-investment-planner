CREATE TYPE "public"."account_fill" AS ENUM('EVEN', 'SEQUENTIAL');--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "account_fill" "account_fill" DEFAULT 'EVEN' NOT NULL;