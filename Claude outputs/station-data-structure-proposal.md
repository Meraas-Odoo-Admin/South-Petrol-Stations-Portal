# Station data — what مديرية أمن سبها sent, and how it should be structured

I read the actual `Station`/`Company`/`StationFuelAvailability`/`SecurityAuthority` models in `apps/api/prisma/schema.prisma` and `docs/OPEN_ITEMS.md` before writing this, not just the six documents you attached — the schema already anticipated most of what's in this batch (right down to the composite-key lesson about station numbers), so this is mostly a confirm-and-extend, not a from-scratch design. No code changed yet, per your instruction — this is the field proposal only.

## What you actually sent — six sources, not one list

| Source | Company/office | Rows | What it covers |
|---|---|---|---|
| Image A | شركة ليبيا للنفط — مكتب المنطقة الجنوبية (owned stations) | 15 | name, number, supervisor name+phone, operator name+phone, location, notes |
| Image B | الطرق السريعة — stations fed by مستودع سبها النفطي | 20 | name, number, address, working/stopped status, fuel-type checkboxes (بنزين95/ديزل/كيروسين), municipality, supply-route note (خط سبها/الشاطي/مرزق/اوباري) |
| Image C | مكتب مبيعات المنطقة الجنوبية | 27 shown, **page 1 of 3** | number, name, location, supervisor name, phone |
| Image D | الشرارة الذهبية للخدمات النفطية | 29 | number, name, location, ownership/status note (مملوكة / خاصة / خاصة‑متوقفة…) |
| Text file | البريقة | 5 | name, number, location, closure note |
| Text file | الثقة الدولية | 11 | name, number, location, closure/supply note |

Two things worth flagging before anything else, because they change what "done" means for this task:
- **Image C is explicitly 1 of 3 pages** — you have 27 of an unknown larger total for مكتب مبيعات المنطقة الجنوبية. Whatever gets imported from this source needs to be treated as partial, not the full list, until pages 2-3 show up.
- **`docs/OPEN_ITEMS.md` #1-3 already anticipated exactly this delivery**: #1 is literally "company attribution for the 27 مكاتب مبيعات الجنوبية rows" (Image C), #2 is "split نفط ليبيا / الطرق السريعة (20 rows) into two companies" (Images A and B, which now arrive as two separately-labeled documents — 15 and 20 rows respectively, which reads as that split already being answered), and #3 is "station list for شركة الراحلة" — which is **still not in this batch**. Raheela is already a seeded company (`الراحلة`, currently only holding a synthetic test fixture) with no real stations yet; nothing here fills that gap.

## Cross-check against the existing schema — most of this already fits

`Station` already has: `internalCode` (system-generated, globally unique — none of your six sources have anything like this, confirming it should stay system-generated, not copied from any source), `stationNumber` (as reported by the company, explicitly **not** globally unique — matches reality here: e.g. Al-Sharara's list uses numbers like 669/677/691, Al-Thiqa uses 2006-2030, Brega uses 1063-1097, Highway uses 303-427, all disjoint ranges but nothing guarantees that holds everywhere), `name`, `companyId`, `municipality` (nullable), `status` (enum), `securityAuthorityId` (nullable, still TBD per open item #4 — this is literally مديرية أمن سبها, the office that sent you this data).

`StationFuelAvailability` already models per-station, per-fuel-type, time-varying availability — that's an exact match for Image B's بنزين95/ديزل/كيروسين checkbox columns. No new field needed, just seed rows (every station in Image B shows بنزين95✓ ديزل✓ كيروسين✗, consistent with the already-`Resolved` open-items note that kerosene isn't actually distributed in the south).

`StationStatus` enum values map onto the notes columns almost one-for-one:

| Enum value | Real phrases seen in the documents |
|---|---|
| `SUSPENDED_LEGAL` | "موقوفة من النائب العام" (Brega, Al-Thiqa) |
| `SUSPENDED_COMMITTEE` | "قفلت من قبل لجنة الوقود" (Image A), "متوقفة — من قبل لجنة الازمة" (Image D) |
| `SUSPENDED_OWNER` | "متوقفة من مالك المحطة" (Image D) |
| `NOT_YET_SUPPLIED` | "لم يتم تزويدها" (Al-Thiqa) |
| `ACTIVE` | Image B's عاملة checkmark; Image D's plain "مملوكة" rows with no suspension note |

Two phrases don't map to any existing value, and I'd rather flag that than force a bad fit: **"مقفلة تحتاج الى محول كهرباء"** (closed, needs an electrical transformer — Image A) is an equipment/infrastructure reason, not legal/committee/owner-choice. **"قفلت بنية رفض المشتق الموزع"** (closed because the owner refused the fuel type being distributed — Image A) is closer to `SUSPENDED_OWNER` but the reason is materially different (a supply/product dispute, not a general owner decision) and probably matters for whoever's tracking why stations go dark. Either add a value (e.g. `SUSPENDED_OPERATIONAL`) or accept the coarser bucket and rely on free text for the specific reason — see the notes-field gap below, since this ties into it directly.

## Real gaps — fields that don't exist yet

**Supervisor contact** (مشرف المحطة + phone) — every one of Images A and C has this, `Station` has nothing like it today. **Operator contact** (مشغل المحطة + phone) — Image A only, and it's a genuinely separate person/role from the supervisor in several rows (e.g. القرصة station: supervisor أيوبكر أحمد, operator الصديق فتوما — different people, different phones), though other rows just say "نفسه" (same as supervisor). Given the existing schema's own pattern of pulling anything multi-valued or role-varying into its own join table rather than flat columns (that's exactly why `StationFuelAvailability` exists instead of boolean columns on `Station`), a `StationContact` table (`stationId`, `role` enum `SUPERVISOR`/`OPERATOR`, `name`, `phone`) fits that precedent better than adding four more nullable columns to `Station` directly — especially since "نفسه" cases would otherwise mean duplicating the same name/phone twice.

**Ownership type** (مملوكة vs خاصة) — Image D treats this as a real per-station attribute, not just a byproduct of which company is reporting it (the same list contains both state-owned and privately-owned stations). This is a distinct axis from both `companyId` and `status` and doesn't cleanly derive from either — flagging as a genuinely new field (`ownershipType`: `STATE_OWNED` / `PRIVATE`, or similar) rather than guessing it can be inferred.

**Supply route** (خط سبها / خط الشاطي / خط مرزق / خط اوباري) — Image B groups all 20 of its stations by which route out of مستودع سبها النفطي supplies them. Nothing in the schema captures this today. Given there's only one depot in this entire batch, I'd lean toward a plain string field for now (`supplyRoute`) rather than standing up a full `Depot` model the way `SecurityAuthority` exists — but that's a judgment call, not a verified requirement, so flagging rather than deciding.

**Free-text notes** — every single one of the six sources has its own ملاحظات-equivalent column, and real content in it doesn't reduce cleanly to an enum (see the two unmapped status phrases above, plus things like "مقفلة تحتاج الى محول كهرباء" carrying operationally-useful detail an enum value would throw away). `Station` has no notes field today. Worth adding one regardless of how the status-enum question above gets resolved — the enum can stay the coarse bucket, notes can carry the real sentence.

## Open questions — need your answer before anything gets imported, not a guess

1. **Is Image A ("شركة ليبيا للنفط — مكتب المنطقة الجنوبية") the same company as the seeded `ليبيا نفط`, or is it — together with Image B — what `docs/OPEN_ITEMS.md` #2 called "نفط ليبيا / الطرق السريعة" pending a split?** They now arrive as two separately-titled documents (15 rows under the Libya Oil letterhead, 20 under a distinct "الطرق السريعة" heading), which reads like the split answer, but I'd rather have you confirm than have the two get silently merged or silently kept split on a guess.
2. **Is Image C ("مكتب مبيعات المنطقة الجنوبية") the same office as open item #1's "مكاتب مبيعات الجنوبية"?** The names are close enough to be the same thing worded two ways, or close enough to be two different offices — needs your confirmation, not pattern-matching on the Arabic.
3. **الراحلة still has no real station list** (open item #3, unchanged by this batch) — is one coming separately, or should Raheela's synthetic fixture just stay as-is for now?
4. **Pages 2 and 3 of Image C** — can you get those from مديرية أمن سبها? Importing page 1 alone means the sales-office station count will read as artificially low.
5. **Cross-source duplicates.** Six independently-compiled paper lists covering the same geographic area (all of them southern-region stations) makes it likely — not certain, but likely — that some physical stations appear more than once under different numbers/companies. I don't have a reliable way to detect that from station number or name alone (numbers are explicitly non-unique by design, and names like "غدوة" or "أشكدة" are place names that could recur legitimately). This needs either your sign-off that overlap isn't a concern, or a manual pass cross-referencing location + name before seeding.

## Proposed shape (pending confirmation above)

```prisma
model Station {
  // existing fields unchanged: id, internalCode, stationNumber, name,
  // companyId, municipality, status, securityAuthorityId, fuelAvailability,
  // userScopes, createdAt, updatedAt

  ownershipType StationOwnershipType?   // new — nullable until every source's rows are classified
  supplyRoute   String?                 // new — e.g. "خط سبها", "خط الشاطي"; null where unknown
  statusNote    String?                 // new — free text, holds the real closure/suspension reason
  contacts      StationContact[]        // new relation
}

enum StationOwnershipType {
  STATE_OWNED
  PRIVATE
}

model StationContact {
  id        String       @id @default(cuid())
  stationId String
  station   Station      @relation(fields: [stationId], references: [id])
  role      ContactRole  // SUPERVISOR | OPERATOR
  name      String
  phone     String?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  @@unique([stationId, role, name]) // allows supervisor==operator as two rows without collapsing them
}

enum ContactRole {
  SUPERVISOR
  OPERATOR
}
```

`StationStatus` gets one new value if you'd rather keep equipment/product-refusal closures distinct from the existing three suspension reasons:

```prisma
enum StationStatus {
  ACTIVE
  SUSPENDED_LEGAL
  SUSPENDED_COMMITTEE
  SUSPENDED_OWNER
  SUSPENDED_OPERATIONAL // new — equipment/infrastructure/product-refusal closures
  NOT_YET_SUPPLIED
  UNVERIFIED
}
```

Nothing here touches `seed.ts` or the actual dummy fixtures — that's the next step once questions 1-5 above are answered, since importing before then risks seeding exactly the kind of silent misattribution `docs/OPEN_ITEMS.md` #1/#2 were already raised to avoid.
