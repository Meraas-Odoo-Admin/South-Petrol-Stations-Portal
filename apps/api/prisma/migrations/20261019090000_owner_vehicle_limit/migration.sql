-- After review (19 Oct 2026): how many vehicles may be registered to one
-- owner. 0 = no limit (what the system did until now). Additive: a setting
-- already present is left as it is.
INSERT INTO "SystemSetting" ("key", "value", "description", "updatedAt")
VALUES ('registration.max_vehicles_per_owner', '0', 'Max vehicles registered to one owner (by identity); 0 = no limit', NOW())
ON CONFLICT ("key") DO NOTHING;
