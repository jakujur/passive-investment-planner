-- Accounts created by the setup wizard belong to the class whose queue lists them.
UPDATE "account" SET "asset_kind" = ac."kind"
FROM "asset_class" ac
WHERE "account"."id" = ANY(ac."account_queue") AND "account"."asset_kind" IS NULL;--> statement-breakpoint
-- The entrepreneur IKZE limit moves from the person to their IKZE account.
UPDATE "account" SET "ikze_entrepreneur" = p."is_entrepreneur"
FROM "person" p
WHERE "account"."person_id" = p."id" AND "account"."wrapper" IN ('IKZE', 'IKZE_OBLIGACJE');
