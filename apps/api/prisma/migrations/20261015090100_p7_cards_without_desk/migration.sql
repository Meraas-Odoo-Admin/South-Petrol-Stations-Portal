-- Phase 7: desks and printers are removed from the app. A card and a card print
-- are recorded against the office and the employee only, so neither needs a
-- desk any more. The RegistrationDesk table, these columns and every value
-- already stored stay.
ALTER TABLE "VehicleCard" ALTER COLUMN "deskId" DROP NOT NULL;
ALTER TABLE "CardPrint" ALTER COLUMN "deskId" DROP NOT NULL;
