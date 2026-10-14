-- Phase 6: a default daily limit of 10 per station for the seeded exception types.
-- Only where no limit is set yet. An edited value is never overwritten, and
-- NULL still means no limit, never zero.
UPDATE "ExceptionType" SET "dailyLimitPerStation" = 10
WHERE "key" IN ('OTHER', 'OTHER_NO_PROOF') AND "dailyLimitPerStation" IS NULL;
