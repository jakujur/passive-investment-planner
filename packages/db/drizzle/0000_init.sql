CREATE TYPE "public"."asset_kind" AS ENUM('EQUITY', 'BONDS', 'REAL_ESTATE', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."etf_rounding" AS ENUM('WHOLE', 'FRACTIONAL');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('ACTIVE', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."instrument_type" AS ENUM('ETF', 'BOND', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('DRAFT', 'DONE');--> statement-breakpoint
CREATE TYPE "public"."property_usage" AS ENUM('OWN', 'RENTAL');--> statement-breakpoint
CREATE TYPE "public"."snapshot_status" AS ENUM('OK', 'PENDING_REVIEW', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('MANUAL', 'IMPORT', 'PLAN');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('BUY', 'DEPOSIT', 'FEE', 'INTEREST');--> statement-breakpoint
CREATE TYPE "public"."wrapper" AS ENUM('IKE', 'IKE_OBLIGACJE', 'IKZE', 'IKZE_OBLIGACJE', 'REGULAR', 'CASH');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"broker" text NOT NULL,
	"wrapper" "wrapper" NOT NULL,
	"wrapper_family" text GENERATED ALWAYS AS (case when wrapper in ('IKE', 'IKE_OBLIGACJE') then 'IKE' when wrapper in ('IKZE', 'IKZE_OBLIGACJE') then 'IKZE' end) STORED,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tax_wrapper_in_pln" CHECK ("account"."wrapper" in ('REGULAR', 'CASH') or "account"."currency" = 'PLN')
);
--> statement-breakpoint
CREATE TABLE "asset_class" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"name" text NOT NULL,
	"target_weight_bp" integer NOT NULL,
	"band_abs_bp" integer,
	"band_rel_bp" integer,
	"benchmark_instrument_id" uuid,
	"purchase_instrument_id" uuid,
	"account_queue" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	CONSTRAINT "asset_class_weight_range" CHECK ("asset_class"."target_weight_bp" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "bond_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"series" text NOT NULL,
	"purchase_date" date NOT NULL,
	"units" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"effective_from" date NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "snapshot_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"currency" text NOT NULL,
	"date" date NOT NULL,
	"rate" bigint NOT NULL,
	CONSTRAINT "fx_rate_currency_date_pk" PRIMARY KEY("currency","date")
);
--> statement-breakpoint
CREATE TABLE "household" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_currency" text DEFAULT 'PLN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_invite_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "household_member" (
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_member_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "instrument" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"isin" text,
	"ticker" text,
	"name" text NOT NULL,
	"type" "instrument_type" NOT NULL,
	"asset_kind" "asset_kind" NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "instrument_isin_unique" UNIQUE("isin")
);
--> statement-breakpoint
CREATE TABLE "mortgage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"balance_minor" bigint NOT NULL,
	"rate_bp" integer NOT NULL,
	"installment_minor" bigint NOT NULL,
	CONSTRAINT "mortgage_propertyId_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"is_entrepreneur" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"month" text NOT NULL,
	"surplus_minor" bigint NOT NULL,
	"carry_in_minor" bigint DEFAULT 0 NOT NULL,
	"carry_out_minor" bigint DEFAULT 0 NOT NULL,
	"result" jsonb NOT NULL,
	"status" "plan_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price" (
	"instrument_id" uuid NOT NULL,
	"date" date NOT NULL,
	"close_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "price_instrument_id_date_pk" PRIMARY KEY("instrument_id","date")
);
--> statement-breakpoint
CREATE TABLE "property" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"usage" "property_usage" NOT NULL,
	"value_minor" bigint NOT NULL,
	"valuation_date" date NOT NULL,
	"include_in_rebalancing" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_down_payment_minor" bigint NOT NULL,
	"account_id" uuid NOT NULL,
	"status" "goal_status" DEFAULT 'ACTIVE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_income" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"rent_minor" bigint NOT NULL,
	"costs_minor" bigint NOT NULL,
	"vacancy_months_per_year" numeric(4, 2) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"monthly_expenses_minor" bigint DEFAULT 0 NOT NULL,
	"cushion_months" integer DEFAULT 9 NOT NULL,
	"cushion_account_id" uuid,
	"cushion_surplus_share_bp" integer DEFAULT 10000 NOT NULL,
	"current_rent_minor" bigint,
	"accelerator_table" jsonb NOT NULL,
	"alert_months_threshold" integer DEFAULT 12 NOT NULL,
	"etf_rounding" "etf_rounding" DEFAULT 'FRACTIONAL' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"instrument_id" uuid,
	"plan_id" uuid,
	"date" date NOT NULL,
	"type" "transaction_type" NOT NULL,
	"quantity" numeric(20, 8),
	"price_minor" bigint,
	"fx_rate" bigint,
	"amount_minor" bigint NOT NULL,
	"source" "transaction_source" NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_class" ADD CONSTRAINT "asset_class_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_class" ADD CONSTRAINT "asset_class_benchmark_instrument_id_instrument_id_fk" FOREIGN KEY ("benchmark_instrument_id") REFERENCES "public"."instrument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_class" ADD CONSTRAINT "asset_class_purchase_instrument_id_instrument_id_fk" FOREIGN KEY ("purchase_instrument_id") REFERENCES "public"."instrument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bond_lot" ADD CONSTRAINT "bond_lot_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invite" ADD CONSTRAINT "household_invite_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invite" ADD CONSTRAINT "household_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_member" ADD CONSTRAINT "household_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mortgage" ADD CONSTRAINT "mortgage_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price" ADD CONSTRAINT "price_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property" ADD CONSTRAINT "property_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_goal" ADD CONSTRAINT "property_goal_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_goal" ADD CONSTRAINT "property_goal_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_income" ADD CONSTRAINT "rental_income_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_cushion_account_id_account_id_fk" FOREIGN KEY ("cushion_account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_instrument_id_instrument_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instrument"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "authAccount_userId_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "account_one_wrapper_family_per_person" ON "account" USING btree ("person_id","wrapper_family") WHERE "account"."wrapper_family" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_class_household_id_kind_index" ON "asset_class" USING btree ("household_id","kind");--> statement-breakpoint
CREATE INDEX "data_snapshot_source_id_key_effective_from_index" ON "data_snapshot" USING btree ("source_id","key","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "household_member_user_id_index" ON "household_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_household_id_month_index" ON "plan" USING btree ("household_id","month");--> statement-breakpoint
CREATE INDEX "transaction_account_id_date_index" ON "transaction" USING btree ("account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_account_id_external_id_index" ON "transaction" USING btree ("account_id","external_id");