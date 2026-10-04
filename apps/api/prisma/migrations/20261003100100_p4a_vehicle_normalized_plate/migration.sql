-- Registration pivot, phase 4a: Vehicle.normalizedPlate — the plate's
-- canonical form `<city>-<serial>` (packages/shared-types/src/plate.ts is
-- the definition): Arabic-Indic digits turned into Western digits, any run
-- of separators read as ONE dash, leading zeros dropped from each part.
--   "8-1234567", "8 1234567", "٨-١٢٣٤٥٦٧", "08-1234567"  ->  "8-1234567"
--   "81-234567"                                          ->  "81-234567"
-- (8-1234567 and 81-234567 are different cars: city code 8 vs 81.)
--
-- A plate that can't be split into exactly a city code (1-2 digits) and a
-- serial number (1-7 digits) — typically one stored with NO separator —
-- gets NULL: there is no honest canonical form for it. Those rows are left
-- as they are and listed by `pnpm --filter @fuel-tracking/api plates:report`
-- for the client to correct; so are any rows that would collide.
--
-- Additive: a new nullable column and a plain (non-unique) index.
-- currentPlate is NOT touched.
ALTER TABLE "Vehicle" ADD COLUMN "normalizedPlate" TEXT;

-- backfill:begin (test/plate-backfill.e2e-spec.ts runs exactly this
-- statement and compares it with normalizePlate())
UPDATE "Vehicle"
SET "normalizedPlate" = (
  SELECT CASE
    WHEN cleaned ~ '^[0-9]+-[0-9]+$'
     AND regexp_replace(split_part(cleaned, '-', 1), '^0+', '') ~ '^[0-9]{1,2}$'
     AND regexp_replace(split_part(cleaned, '-', 2), '^0+', '') ~ '^[0-9]{1,7}$'
    THEN regexp_replace(split_part(cleaned, '-', 1), '^0+', '')
         || '-' || regexp_replace(split_part(cleaned, '-', 2), '^0+', '')
  END
  FROM (
    SELECT trim(both '-' FROM regexp_replace(
      translate("Vehicle"."currentPlate", '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      '[[:space:]\-./\\_ ·ـ‐-―−‎‏‪-‮⁦-⁩]+',
      '-', 'g'
    )) AS cleaned
  ) AS parsed
);
-- backfill:end

CREATE INDEX "Vehicle_normalizedPlate_idx" ON "Vehicle"("normalizedPlate");
