-- AlterEnum
ALTER TYPE "FillUpIdentification" ADD VALUE 'NO_CARD';

-- AlterTable
ALTER TABLE "Exception" ADD COLUMN     "overLimit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ExceptionType" ADD COLUMN     "dailyLimitPerStation" INTEGER,
ADD COLUMN     "municipalityId" TEXT,
ADD COLUMN     "overridableRules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "FillUpTransaction" ADD COLUMN     "noCardReason" TEXT;

-- CreateTable
CREATE TABLE "MunicipalitySetting" (
    "id" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalitySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionFlag" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "exceptionTypeId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalitySetting_municipalityId_key_key" ON "MunicipalitySetting"("municipalityId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ExceptionFlag_stationId_day_kind_exceptionTypeId_key" ON "ExceptionFlag"("stationId", "day", "kind", "exceptionTypeId");

-- AddForeignKey
ALTER TABLE "MunicipalitySetting" ADD CONSTRAINT "MunicipalitySetting_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 6 settings: the strict switch and the unreasonable-station threshold.
-- Never overwrites a value an admin already set.
INSERT INTO "SystemSetting" ("key", "value", "description", "updatedAt")
VALUES
  ('exceptions.strict_limit', 'false', 'Refuse an exception use beyond the type daily limit at a station (otherwise it is allowed, flagged and notified)', CURRENT_TIMESTAMP),
  ('exceptions.station_daily_threshold', '20', 'Exceptions of all types at one station in one day beyond which the station is flagged', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
