/*
  Warnings:

  - You are about to drop the column `municipality` on the `Station` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "StationOwnershipType" AS ENUM ('GOVERNMENT', 'PRIVATE');

-- AlterTable
ALTER TABLE "Station" DROP COLUMN "municipality",
ADD COLUMN     "municipalityId" TEXT,
ADD COLUMN     "operatorName" TEXT,
ADD COLUMN     "operatorPhone" TEXT,
ADD COLUMN     "operatorSameAsSupervisor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ownershipType" "StationOwnershipType",
ADD COLUMN     "routeId" TEXT,
ADD COLUMN     "statusNote" TEXT,
ADD COLUMN     "supervisorName" TEXT,
ADD COLUMN     "supervisorPhone" TEXT;

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_name_key" ON "Municipality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Route_name_key" ON "Route"("name");

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;
