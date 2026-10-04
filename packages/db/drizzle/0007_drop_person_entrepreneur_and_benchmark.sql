ALTER TABLE "asset_class" DROP CONSTRAINT "asset_class_benchmark_instrument_id_instrument_id_fk";
--> statement-breakpoint
ALTER TABLE "asset_class" DROP COLUMN "benchmark_instrument_id";--> statement-breakpoint
ALTER TABLE "person" DROP COLUMN "is_entrepreneur";