-- Phase 6: the municipality activation switch records when it was switched on and by whom.
-- Additive. The two stage-date columns stay in place, unused.
ALTER TABLE "Municipality" ADD COLUMN "activatedAt" TIMESTAMP(3);
ALTER TABLE "Municipality" ADD COLUMN "activatedById" TEXT;

-- A municipality that is already on keeps the date it was created as the best known "since".
UPDATE "Municipality" SET "activatedAt" = "createdAt" WHERE "status" = 'LIVE' AND "activatedAt" IS NULL;
