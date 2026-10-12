-- Phase 5A: an optional area / neighbourhood on petrol stations and registration
-- offices, for the municipality manager list filter. Additive, nullable.
ALTER TABLE "Station" ADD COLUMN     "locality" TEXT;
ALTER TABLE "RegistrationStation" ADD COLUMN     "locality" TEXT;
