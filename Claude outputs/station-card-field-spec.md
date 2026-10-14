# Station card — fields, hierarchy, and where each value comes from

Narrower ask than the earlier file: not a schema migration, not a dedup project — just what a station record actually needs to hold, what the "add new station" form should ask for in what order, and which of those fields are typed values vs. dropdowns pulled from Settings. Two or three real example cards at the end, filled from the actual documents, to prove the structure holds up — not a real import.

## Hierarchy

A station doesn't stand alone — it sits inside three other things, and two more things sit inside *it*:

```
Security Authority (مديرية أمن سبها, ...)      ─┐
Company (ليبيا نفط, الشرارة الذهبية, ...)        ─┼─▶  Station  ─┬─▶ Fuel types available (one or more)
Municipality (سبها, الشاطئ, مرزق, ...)          ─┘             └─▶ Contacts (supervisor, operator)
```

Security Authority, Company, and Municipality are all things a station *belongs to* — none of them belong to the station. Fuel types and Contacts are the reverse: they only exist attached to a station, a station can have several of each, and neither makes sense on its own. That distinction is what decides typed-field vs. dropdown vs. its-own-mini-list below.

## The card, in the order you'd fill it out

| # | Field (Arabic label) | Type | Required | Where the options come from |
|---|---|---|---|---|
| — | الكود الداخلي | auto-generated, read-only | — | System-assigned on save. Never typed in — this is the one identifier guaranteed unique across every company's overlapping numbering. |
| 1 | الشركة | dropdown | yes | **Settings** — managed company list (already exists: ليبيا نفط, الراحلة, الشرارة الذهبية, الطرق السريعة, الثقة الدولية, البريقة, +new ones as needed) |
| 2 | رقم المحطة | text (digits) | yes | Typed. Company-assigned, so it repeats across companies by design — uniqueness is only enforced per-company, not system-wide. |
| 3 | اسم المحطة | text | yes | Typed |
| 4 | البلدية / الموقع | dropdown | yes | **Settings** — managed municipality list. Real data reuses the same ~15-20 municipality names across dozens of stations (سبها, الشاطئ, مرزق, تراغن, غات, تمنهنت, القطرون, اوباري...), so this should be a picklist, not free text — typed entry guarantees spelling drift ("الشاطئ" vs "الشاطئي" vs "الشاطي" all appear across your own documents). |
| 5 | خط الإمداد | dropdown, optional | no | **Settings** — managed route list (خط سبها / خط الشاطئ / خط مرزق / خط اوباري, seen in the Highway company's list). Leave blank where the source doesn't specify one — most of your sources don't. |
| 6 | الجهة الأمنية المشرفة | dropdown, optional | no | **Settings** — managed list (مديرية أمن سبها is the one example you have; add others as they come up) |
| 7 | نوع الملكية | dropdown | yes | **Fixed, not Settings** — مملوكة (state) / خاصة (private). Only ever two values and nothing else references it, but see the note below on why this one shouldn't be admin-editable anyway. |
| 8 | حالة المحطة | dropdown | yes, defaults to نشطة | **Fixed, not Settings** — see note below. |
| 9 | ملاحظة الحالة | text, conditional | no | Typed. Only worth showing once حالة المحطة is anything other than نشطة — this is where "مقفلة تحتاج الى محول كهرباء" or "قفلت بنية رفض المشتق الموزع" actually lives, since neither reduces to a clean status value. |
| 10 | أنواع الوقود المتوفرة | multi-select (checkboxes) | at least one | **Fixed, not Settings** — بنزين 95 / ديزل / كيروسين. A station can offer more than one, so this isn't a single dropdown. |
| 11 | مشرف المحطة — الاسم | text | no | Typed |
| 12 | مشرف المحطة — الهاتف | text (phone) | no | Typed |
| 13 | "المشغل نفس المشرف؟" | toggle | — | If on, skip 14/15 and copy 11/12. This is the "نفسه" case that shows up constantly in the real data — worth a real toggle instead of making someone retype the same name and number. |
| 14 | مشغل المحطة — الاسم | text, conditional | no | Typed (only if toggle above is off) |
| 15 | مشغل المحطة — الهاتف | text (phone), conditional | no | Typed (only if toggle above is off) |

## Why status and ownership-type aren't Settings-managed like the others

Company, municipality, route, and security authority are pure labels — nothing in the code branches on which municipality a station is in. Status is different: whatever the rule engine, reporting, and filtering logic checks against "is this station active" needs a fixed, known set of values to test against. If حالة المحطة were a freely-editable Settings list, someone could rename or delete نشطة and quietly break every place in the app that checks for it. Same logic for فوع الوقود (the rule engine and fuel-availability reporting reference these three specific values by name) and, more weakly, نوع الملكية (only two values, unlikely to need a third, low risk either way but no reason to make it editable when it doesn't need to be). Practically: these three still render as dropdowns in the form — the distinction is invisible to whoever's filling out the card — they just live in code/an enum rather than in the Settings screen that manages Company/Municipality/Route/Security-Authority.

## Three filled examples, straight from what you sent

**تجرهي — chosen because supervisor and operator are two different people, which is the more complex case:**

| Field | Value |
|---|---|
| الشركة | ليبيا نفط |
| رقم المحطة | 675 |
| اسم المحطة | تجرهي |
| البلدية | القطرون |
| نوع الملكية | مملوكة |
| حالة المحطة | نشطة |
| أنواع الوقود | بنزين 95، ديزل (كيروسين غير متوفر بالجنوب حاليًا) |
| مشرف المحطة | «[محذوف]» — «[محذوف]» |
| مشغل المحطة | «[محذوف]» — «[محذوف]» |

**الرقيبة — chosen because it's the simpler "operator = supervisor" case:**

| Field | Value |
|---|---|
| الشركة | ليبيا نفط |
| رقم المحطة | 703 |
| اسم المحطة | الرقيبة |
| البلدية | الرقيبة |
| نوع الملكية | مملوكة |
| حالة المحطة | نشطة |
| مشرف المحطة | «[محذوف]» — «[محذوف]» |
| مشغل المحطة | (نفس المشرف) |

**محطة زهرة مرزق — chosen because it's the opposite extreme: almost nothing known yet, which the card needs to handle gracefully:**

| Field | Value |
|---|---|
| الشركة | الثقة الدولية |
| رقم المحطة | 2011 |
| اسم المحطة | زهرة مرزق |
| البلدية | مرزق (أدليم) |
| حالة المحطة | لم تُزوَّد بعد |
| ملاحظة الحالة | لم يتم تزويدها |
| مشرف المحطة / مشغل المحطة | غير معروف — لا بيانات اتصال في المصدر |

That third one is the important case to design for, not the edge case to special-handle: a lot of your real rows only have name + number + location + a closure reason, nothing else. The card has to accept a station with just those four fields filled and everything else left empty, not demand contact info that plainly doesn't exist yet for most of these.

---

Once you confirm this shape, next step is adding these three (or a couple of others you'd rather use) as real seed rows for testing — small, deliberately, not the full six-source import from the earlier file.
