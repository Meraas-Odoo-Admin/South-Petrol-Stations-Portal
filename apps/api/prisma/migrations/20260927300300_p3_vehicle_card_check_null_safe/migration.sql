-- Registration pivot, phase 3 — fix: the original CHECK let an ACTIVE card
-- with a NULL activeForVehicleId through. ("activeForVehicleId" = "vehicleId")
-- is NULL (unknown) when the marker is NULL, and a CHECK only rejects FALSE,
-- never unknown. Rewritten with explicit NULL tests so every combination
-- evaluates to TRUE or FALSE. No data changes: the rule the app already
-- follows (ACTIVE ⇔ marker = vehicleId) is only made strict in the database.

ALTER TABLE "VehicleCard" DROP CONSTRAINT "VehicleCard_active_marker_check";

ALTER TABLE "VehicleCard" ADD CONSTRAINT "VehicleCard_active_marker_check" CHECK (
  ("status" = 'ACTIVE' AND "activeForVehicleId" IS NOT NULL AND "activeForVehicleId" = "vehicleId")
  OR ("status" <> 'ACTIVE' AND "activeForVehicleId" IS NULL)
);
