-- Instruments created before quote symbols existed; new ones get it at creation.
UPDATE "instrument" SET "quote_symbol" = 'IUSQ.DE' WHERE "isin" = 'IE00B6R52259' AND "quote_symbol" IS NULL;--> statement-breakpoint
-- Gold is quoted by NBP in PLN per gram, so its unit is one gram.
UPDATE "instrument" SET "name" = 'Złoto (1 g)' WHERE "type" = 'GOLD' AND "ticker" = 'XAU';
