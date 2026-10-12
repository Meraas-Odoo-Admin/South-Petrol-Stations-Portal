-- Phase 5A: municipalities become the core. All additive.
--  - Role.municipalityScoped: holders are confined to their municipality scope.
--  - UserMunicipalityScope: which municipalities such a user reaches.
--  - archivedAt / archivedById on municipalities, petrol stations, registration
--    stations and users: "delete" means archive, history stays.

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "municipalityScoped" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Municipality" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- AlterTable
ALTER TABLE "Station" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- AlterTable
ALTER TABLE "RegistrationStation" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "archivedById" TEXT;

-- CreateTable
CREATE TABLE "UserMunicipalityScope" (
    "userId" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,

    CONSTRAINT "UserMunicipalityScope_pkey" PRIMARY KEY ("userId","municipalityId")
);

-- CreateIndex
CREATE INDEX "UserMunicipalityScope_municipalityId_idx" ON "UserMunicipalityScope"("municipalityId");

-- AddForeignKey
ALTER TABLE "UserMunicipalityScope" ADD CONSTRAINT "UserMunicipalityScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMunicipalityScope" ADD CONSTRAINT "UserMunicipalityScope_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
