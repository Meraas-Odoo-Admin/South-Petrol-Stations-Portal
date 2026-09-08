-- CreateTable
CREATE TABLE "OwnerChangeRequest" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "currentIdentityType" "IdentityType" NOT NULL,
    "currentIdentityNumber" TEXT NOT NULL,
    "requestedIdentityType" "IdentityType" NOT NULL,
    "requestedIdentityNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "proofReference" TEXT NOT NULL,
    "status" "VehicleChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerChangeRequest_ownerId_idx" ON "OwnerChangeRequest"("ownerId");

-- AddForeignKey
ALTER TABLE "OwnerChangeRequest" ADD CONSTRAINT "OwnerChangeRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "VehicleOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerChangeRequest" ADD CONSTRAINT "OwnerChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerChangeRequest" ADD CONSTRAINT "OwnerChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
