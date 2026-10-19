-- After review (19 Oct 2026): the stock of a station tank is the fuel dispensed
-- of one type at one station since a moment; «مراقبة المحطات» asks it for
-- every station of a municipality. Additive: an index only.
CREATE INDEX "FillUpTransaction_stationId_fuelType_occurredAt_idx" ON "FillUpTransaction"("stationId", "fuelType", "occurredAt");
