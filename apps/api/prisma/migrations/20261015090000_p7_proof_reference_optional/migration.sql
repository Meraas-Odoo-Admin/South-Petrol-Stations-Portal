-- Phase 7: «رقم/مرجع الإثبات» is removed from every form. The two change-request
-- tables required it; they now accept a request without one. The columns and
-- every value already stored stay.
ALTER TABLE "OwnerChangeRequest" ALTER COLUMN "proofReference" DROP NOT NULL;
ALTER TABLE "VehicleChangeRequest" ALTER COLUMN "proofReference" DROP NOT NULL;
