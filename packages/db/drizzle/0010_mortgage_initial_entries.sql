-- Existing mortgages start their history with a bank state as of the property valuation date;
-- the end month is derived from the installment the next time the mortgage is recomputed.
INSERT INTO "mortgage_entry" ("mortgage_id", "kind", "date", "balance_after_minor", "rate_bp", "installment_minor")
SELECT m."id", 'BANK', p."valuation_date", m."balance_minor", m."rate_bp", m."installment_minor"
FROM "mortgage" m
JOIN "property" p ON p."id" = m."property_id"
WHERE NOT EXISTS (SELECT 1 FROM "mortgage_entry" e WHERE e."mortgage_id" = m."id");
