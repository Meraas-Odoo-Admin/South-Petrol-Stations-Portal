# Phase 5A — field-validation audit

Every input in the app, what its rule was before phase 5A, what it is now, and whether it is required.

How to read it:

- **Where the rule lives:** every format rule below marked *shared* is one function in `packages/shared-types/src/validation.ts` (or `plate.ts`). The API's DTO validators and the web forms call the same function, so a value one accepts the other accepts, and the Arabic message is the same text on both sides. `scripts/shared-validators.test.mjs` fails if either side grows its own copy.
- **Unchanged** means the rule was checked in this audit and left as it was.
- Messages are Arabic and shown next to the field. The API's 400 body carries the same sentence, which the registration form shows when a rule is broken server-side.

## Registration — owner (individual)

| Form | Field | Rule before | Rule after | Required? |
|---|---|---|---|---|
| Owner | Kind (فرد / جهة) | none (no concept) | choose فرد or جهة / مؤسسة | yes (default فرد) |
| Owner | Identity type | national ID, administrative ID or driver's license (provisional) | national ID or administrative ID only; the driver's-license path is removed | yes |
| Owner | National ID | `^[12]\d{11}$` | *shared:* 12 digits; digit 1 is 1 or 2; digits 2–5 a real year ≥ 1900, not in the future; owner ≥ 18 (birth year ≤ Tripoli year − 18); digit 12 any digit (check formula pending); Arabic-Indic digits and spaces normalised; live help and live errors | yes |
| Owner | Administrative number | `^9\d{11}$` | *shared:* 12 digits starting with 9; live errors | yes (when that type is chosen) |
| Owner | Name | any text, ≥ 1 character | *shared:* Arabic letters, spaces and a few marks only, 3–100 characters | yes |
| Owner | Phone | `^(?:\+?218)?0?9\d{8}$` (any digit after 09) | *shared:* Libyan mobile `09[1-6]` + 7 digits; `+218`, `00218` and Arabic-Indic digits accepted and stored as `09XXXXXXXX` | yes |
| Owner | Address | optional text | unchanged | no |

## Registration — owner (institution)

| Form | Field | Rule before | Rule after | Required? |
|---|---|---|---|---|
| Institution | Name | — | *shared:* 3–150 characters containing letters; a spelling that differs only in diacritics, hamza or spacing counts as the same institution (duplicate refused, the existing one is named and suggested while typing) | yes |
| Institution | Responsible driver's national ID | — | *shared:* every national-ID rule above, including 18+ | yes |
| Institution | Driver's name | — | *shared:* Arabic letters, 3–100 | no |
| Institution | Driver's phone | — | *shared:* Libyan mobile | no |
| Institution | Phone / address | — | phone: Libyan mobile when given; address free text | no |

## Registration — vehicle (field order is now: plate, chassis, booklet, then details)

| Form | Field | Rule before | Rule after | Required? |
|---|---|---|---|---|
| Vehicle | Plate | city code 1–2 digits + separator + serial 1–7 digits | same, plus an optional trailing **N** that is part of the plate's identity (`5-123456N` ≠ `5-123456`) in registration, the typed pump plate, search, duplicate checks and the normaliser; `5-123456N`, `5 123456 n` and `5-123456-N` are one plate | yes |
| Vehicle | Chassis number | optional; if given 17 chars `[A-HJ-NPR-Z0-9]` | *shared:* required; 17 characters (no I, O, Q), upper-cased automatically; 6–20 characters only when «رقم هيكل غير قياسي» is ticked, and the tick is recorded and shown; duplicate refused naming the existing vehicle | yes |
| Vehicle | Booklet number | optional; 6–12 alphanumeric | *shared:* required; 6–12 letters/digits, upper-cased; duplicate refused | yes |
| Vehicle | Make (الصانع) | picked from a brand list (stored in `model`) | free text exactly as in the booklet, ≤ 60 characters | yes |
| Vehicle | Model (الطراز) | did not exist (the one `model` field held the make) | free text exactly as in the booklet, ≤ 60 characters | yes |
| Vehicle | Colour | optional free text | list of 16 common colours plus «أخرى» with text, ≤ 30 characters | yes |
| Vehicle | Manufacturing year | optional integer, no range | *shared:* 4 digits, 1950 to next year (Tripoli) | yes |
| Vehicle | Fuel type | did not exist | بنزين or ديزل; a different fuel at the pump warns (never blocks) and is recorded | yes |
| Vehicle | Vehicle type | optional lookup | unchanged | no |
| Vehicle | Owner, registration office | required | unchanged | yes |

## Editing and correcting existing records

| Form | Field | Rule before | Rule after | Required? |
|---|---|---|---|---|
| Vehicle edit | Make, model, colour, year | cosmetic, saved directly, free text / any integer | same shared rules as at registration | yes (each, when the form is saved) |
| Vehicle edit | Fuel type | — | بنزين / ديزل, saved directly | yes |
| Change request | New chassis | 17 chars | *shared:* 17, or 6–20 with the tick (the vehicle's non-standard flag follows the new value) | yes |
| Change request | New booklet | 6–12 alphanumeric | *shared:* same | yes |
| Change request | New plate | city + serial | same normaliser, trailing N allowed | yes |
| Change request | Reason, proof reference | non-empty | unchanged | yes |
| Owner edit | Name | any text | Arabic person name, or institution-name rule for an institution; for an institution a name that would duplicate another is refused | yes |
| Owner edit | Phone | `LIBYAN_MOBILE_REGEX` | *shared:* Libyan mobile `09[1-6]…` | no (empty clears) |
| Owner edit | Responsible driver ID / name / phone | — | national-ID rules / Arabic name / Libyan mobile; institutions only | no |
| Owner identity correction | Type | national, administrative or license | national or administrative only | yes |
| Owner identity correction | Number | per type | *shared:* same rules as at registration, live; digits normalised | yes |

## People, places and municipalities

| Form | Field | Rule before | Rule after | Required? |
|---|---|---|---|---|
| New / edit person | Full name | 2–120 characters | unchanged (staff names are not forced to Arabic: accounts are made by their manager and may carry Latin names) | yes |
| New / edit person | Username | 3–60; web: letters, digits, `._-` | unchanged; fixed after creation | yes |
| New / edit person | Phone | any text ≤ 30 | *shared:* Libyan mobile; empty clears; stored as `09XXXXXXXX` | no |
| New person | Job, places | job optional for admins; place per side | job required for everyone but the super admin; exactly one municipality for a municipality manager; places must exist, be un-archived and inside the caller's scope | yes |
| Archive / restore person, station, office, municipality | Reason | — | 3–300 characters, audited | yes |
| Municipality | Name | ≥ 1 character | 2–80 characters, unique | yes |
| Municipality | Card prefix | 2–5 capital letters, unique | unchanged; also settable at creation | no |
| Municipality | Security directorate name | picked per municipality | created automatically as «مديرية أمن ‹الاسم›»; 3–120 characters when renamed, unique | yes (automatic) |
| Municipality | Awareness / deadline dates | real calendar days, awareness before deadline, name typed if the deadline is today or earlier | unchanged | no |
| Petrol station | Company, number, name | required | unchanged; station number repeats across companies by design, the pair is the key | yes |
| Petrol station | Municipality | optional | required for a municipality manager, inside their scope | yes (for managers) |
| Petrol station | Supervisor / operator phone | any text | *shared:* Libyan mobile, optional | no |
| Petrol station | Locality | did not exist | free text ≤ 80 | no |
| Registration office | Name, municipality, address | required | unchanged; municipality inside the manager's scope | yes |
| Registration office | Contact phone | digits with optional `+`, 6–20 (landlines allowed) | unchanged on the API; the form now checks it too | no |
| Registration office | Latitude, longitude | API: valid latitude/longitude | the form checks -90..90 and -180..180 before sending | no |
| Registration office | Locality | did not exist | free text ≤ 80 | no |
| Desk | Name | ≥ 1 character, unique in its office | unchanged | yes |
| Desk | Printer model, serial | optional text | unchanged | no |
| Company | Name | unique, ≥ 1 character | unchanged; **creating** is the municipality manager's, **editing or archiving** only the super admin's | yes |

## Fill-ups, exceptions, settings, stock

| Form | Field | Rule before | Rule after | Required? |
|---|---|---|---|---|
| Fill-up | Quantity (liters) | > 0 and ≤ 1000 (API); web said the same in its own words | > 0 and ≤ 1000 from one shared constant, one Arabic message on both sides | yes |
| Fill-up | Typed plate | normaliser (city + serial) | same, trailing N allowed; a plate that cannot be split is refused | yes (when no card) |
| Fill-up | Fuel type | enum | unchanged; mismatch with the vehicle's fuel type warns, never blocks | yes |
| Fill-up exception | Type, reason, proof | type required, reason required, proof per type | unchanged | yes / yes / per type |
| Emergency override | Reason | non-empty, needs the permission | unchanged | yes |
| Standing exception | Rules, reason, expiry | ≥ 1 rule, reason required, ISO date | unchanged | rules, reason: yes; expiry: no |
| Settings | Numeric rules | number | unchanged | yes |
| Settings | Rule switches | — | exactly `true` or `false`, super admin only | yes |
| Card stock | Quantity | integer 0 – 1,000,000 | unchanged | yes |
| Card stock | Date | ISO, not in the future | unchanged | no (defaults to now) |
| Card stock | Note / correction reason | ≤ 300 / required for a correction | unchanged | no / yes |
| Card issue / cancel | Reason, note | reason from the list; note for cancel | unchanged | yes |
| Sign-in, change password | Username, password | existing rules | unchanged | yes |

## Dates

The only "not in the future" date a person types is the card-stock entry date (checked by the API). Stage dates are meant to be in the future and are guarded by the typed-name confirmation instead; a standing exception's expiry is by definition in the future.
