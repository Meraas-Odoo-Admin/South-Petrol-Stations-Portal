-- Phase 5A: every fill-up rule can be switched on or off (super admin only).
-- Defaults: all on, except the owner liters rule, which is off. ON CONFLICT DO
-- NOTHING: a value an admin already set is never overwritten.
INSERT INTO "SystemSetting" ("key", "value", "description", "updatedAt") VALUES
  ('fillup.rule.vehicle_gap.enabled',    'true',  'Rule switch: minimum days between two fill-ups of the same vehicle', NOW()),
  ('fillup.rule.vehicle_weekly.enabled', 'true',  'Rule switch: weekly fill-up count per vehicle', NOW()),
  ('fillup.rule.owner_gap.enabled',      'true',  'Rule switch: minimum days between two fill-ups of the same owner', NOW()),
  ('fillup.rule.owner_weekly.enabled',   'true',  'Rule switch: weekly fill-up count per owner', NOW()),
  ('fillup.rule.owner_liters.enabled',   'false', 'Rule switch: weekly liters per owner', NOW())
ON CONFLICT ("key") DO NOTHING;
