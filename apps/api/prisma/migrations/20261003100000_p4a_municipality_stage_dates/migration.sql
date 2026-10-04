-- Registration pivot, phase 4a: the two optional calendar days that move a
-- LIVE municipality from grace to awareness to card-required. Additive:
-- two nullable columns, no existing row changes (NULL = grace indefinitely).
ALTER TABLE "Municipality"
  ADD COLUMN "awarenessStartDate" DATE,
  ADD COLUMN "cardRequiredFromDate" DATE;
