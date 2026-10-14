-- Phase 6: the card is ONE face and prints the vehicle details beside the QR code.
-- Additive: old cards keep NULLs and read the vehicle's current values when reprinted.
ALTER TABLE "VehicleCard" ADD COLUMN "printedMakeModel" TEXT;
ALTER TABLE "VehicleCard" ADD COLUMN "printedColor" TEXT;
ALTER TABLE "VehicleCard" ADD COLUMN "printedYear" TEXT;
ALTER TABLE "VehicleCard" ADD COLUMN "printedFuel" TEXT;
ALTER TABLE "VehicleCard" ADD COLUMN "printedChassis" TEXT;
ALTER TABLE "VehicleCard" ADD COLUMN "printedBooklet" TEXT;
