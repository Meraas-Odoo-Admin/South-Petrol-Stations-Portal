# Open items — pending client answers

Living tracker. Update the **Status** column as answers arrive from اللواء جمال العمامي, and update the linked schema/config the moment they do. See `IMPLEMENTATION_PLAN.md` §13 for how each item plugs into the codebase.

| # | Question | Asked | Status | Plugs into |
|---|---|---|---|---|
| 1 | Company attribution for the 27 "مكاتب مبيعات الجنوبية" station rows | 22 Aug 2026 | Pending | `Station.companyId` seed data |
| 2 | Split "نفط ليبيا / الطرق السريعة" (20 rows) into two companies | 22 Aug 2026 | Pending | `Station.companyId` seed data |
| 3 | Station list for شركة الراحلة | 22 Aug 2026 | Pending | New `Station` seed rows |
| 4 | System scope: مديرية أمن سبها only, or all لجنة إعادة تنظيم المدن stations? | 22 Aug 2026 | Pending | `Station.securityAuthorityId` |
| 5 | Who actually records a fill-up at each station? | 22 Aug 2026 (re-ask, unanswered in round 1) | Pending | `station_employee` permission set |
| 6 | Are the 4 proposed roles (employee/supervisor/directorate admin/system admin) sufficient? | 22 Aug 2026 | Pending | `Role`/`Permission` seed rows |
| 7 | Driver phone number still required? | 22 Aug 2026 (re-ask) | Pending | `Driver.phone` required vs optional |
| 8 | Chassis number confirmed on Vehicle, not Driver | 22 Aug 2026 (re-ask) | Pending confirmation | Already modeled correctly — confirm only |
| 9 | Photo storage for driver ID/license? | 22 Aug 2026 (re-ask) | Pending | Would add `documentUrl` + object storage (not yet in scope) |
| 10 | Legacy paper/Excel records to migrate? | 22 Aug 2026 (re-ask) | Pending | Import/seed script scope, M1–M2 |
| 11 | Administrative ID issuing authority / verifiability | 22 Aug 2026 (re-ask) | Pending | Manual vs. API verification (future) |
| 12 | Transit-traveler exception — definition, proof, duration | 22 Aug 2026 (re-ask) | Pending | New `ExceptionType` row + rule detail |
| 13 | Medical exception — cap increase vs. gap-only, proof, renewal | 22 Aug 2026 (re-ask) | Pending | `ExceptionType` + rule engine parameter |
| 14 | The "200" figure — drivers per station or daily fill-ups? | 22 Aug 2026 (re-ask) | Pending | Capacity planning, M5 |
| 15 | UI language: Arabic only or bilingual? | 22 Aug 2026 (re-ask) | Pending | `shared-types` i18n scaffolding |
| 16 | Remote access needed for directorate staff outside stations? | 22 Aug 2026 (re-ask) | Pending | Deployment network/VPN posture |
| 17 | Internet stability at stations | 22 Aug 2026 (re-ask) | Pending | Whether M6 (offline sync) is built |

**Resolved** (moved here once confirmed by the client — 22 Aug 2026 round):

- Station numbers are not globally unique; duplicates across companies are expected, not errors. → composite key `(companyId, stationNumber)`.
- No central station registry exists at شركة البريقة level. → `internalCode` is the system's own generated identifier.
- Fuel type per station is time-varying, not fixed. → `StationFuelAvailability` join table, admin-editable.
- Currently only بنزين 95 and الديزل are actually supplied in the south; kerosene unused. → seed data reflects this, `KEROSENE` enum value kept for future-proofing only.
- 3×/week + 2-day-gap rule applies across all stations combined, keyed to vehicle plate, with a directorate-approved exception path (no hard block). → `FillUpRuleEngine`, confirmed in the original questionnaire response.
- Multi-vehicle drivers need both a per-vehicle cap and an aggregate per-driver cap. → confirmed design requirement for the rule engine (implementation detail still to be finalized against §13 item 6 driver phone / role clarifications, but the requirement itself is settled).
