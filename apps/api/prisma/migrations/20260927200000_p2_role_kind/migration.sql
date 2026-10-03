-- Registration pivot, phase 2: which side of the petrol-station /
-- registration split a role belongs to, so "no user holds both" can be
-- enforced from data rather than role names. Additive only: a new enum and
-- a new nullable column.

-- CreateEnum
CREATE TYPE "RoleKind" AS ENUM ('PETROL_STATION', 'REGISTRATION');

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "kind" "RoleKind";

-- Backfill the two existing petrol-station roles, so the separation rule
-- holds on an existing database even before the seed/bootstrap sync
-- (which sets every catalog role's kind from rbac-catalog.ts) is re-run.
-- The registration roles don't exist until that sync creates them.
UPDATE "Role" SET "kind" = 'PETROL_STATION'
WHERE "name" IN ('station_employee', 'station_supervisor') AND "kind" IS NULL;
