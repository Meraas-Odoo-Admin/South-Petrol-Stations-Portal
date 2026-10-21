-- After review (21 Oct 2026): every fill-up is a fixed amount in LYD (6 now)
-- of the vehicle's own fuel. Additive: a setting already present is left as it is.
INSERT INTO "SystemSetting" ("key", "value", "description", "updatedAt")
VALUES ('fillup.fixed_amount_lyd', '6', 'LYD of every fill-up; the liters are this amount divided by the price of the vehicle''s fuel', NOW())
ON CONFLICT ("key") DO NOTHING;
