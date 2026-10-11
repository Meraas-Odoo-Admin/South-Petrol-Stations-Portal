# Handoff: Fuel Fill-Up Control System — Round 2 (complete screen set)

**Supersedes Round 1.** The Round 1 file (`Fuel Control System - Design Directions.dc.html`) is kept for history only. Two of its instructions were wrong and are corrected here:

1. **Raw internal codes must never appear in the UI at all.** Round 1 said to show a code next to its Arabic meaning. That was wrong. No rule identifier, enum value, or database field name is ever user-facing. Every state has a written Arabic label — see the label dictionary (option `1b`), which is the authoritative mapping.
2. **Every screen has both a desktop and a phone artboard.** Round 1 left mobile to be extrapolated; it wasn't, twice. Implement from the drawn artboards, not from tokens plus judgment.

## Start here
**`CLAUDE-CODE-PROMPT.md`** in this folder is the paste-in prompt for an implementation session. It carries the delta against the current codebase, the corrected content rule, and a suggested build order. This README is the reference behind it: full screen index, tokens, content rules, accessibility baseline.

**The codebase is already well ahead of round 2.** Most of rounds 1–2 is implemented in `apps/web/src` (`DigitBoxInput`, Arabic rule messages, owner-based fill-ups, admin pages, change requests, standing exceptions). Treat this folder as a delta, not a rebuild brief.

## Design file
`Fuel Control System - Round 2 Screens.dc.html` — a design reference, not production code. Inline styles exist because the mockup tool requires them; build in the real stack.

**Target stack** (existing `South Petrol Stations Portal`): NestJS + Prisma/PostgreSQL API; React + Vite + react-router-dom + TanStack Query + Tailwind CSS web app in `apps/web/src/`. Shared types in `packages/shared-types`. Repo rules in `CLAUDE.md` take precedence over anything here that conflicts.

## Screen index

| Option | Screen | Widths |
|---|---|---|
| `1a` | Foundations: palette, type scale, radius/shadow | reference |
| `1b` | **Arabic label dictionary** — every internal state → its Arabic text | reference |
| `2a` | **Mobile navigation pattern**: bottom bar (4 items) + top-drop sheet for the rest | phone ×2 states |
| `3a` `3b` | Login | desktop + phone |
| `3c` | Forced first-login password change, with worded strength | phone |
| `4a` `4b` | Fill-up recording | desktop + phone |
| | ⚠️ **superseded by `12a`–`12f`** — these still show the driver step, which is out of scope | |
| `4c` | Rule violation inline + exception submission | phone |
| | ⚠️ superseded by `12b` (violation branch) | |
| `4d` | Post-record confirmation | phone |
| `5a` `5b` | Vehicles directory | desktop + phone |
| `5c` `5d` | Vehicle detail: identity, full plate history, driver/owner, fill-up log | desktop + phone |
| `6a` | Drivers directory, masked national IDs | desktop |
| `6b` `6c` | Driver detail + standing-exceptions panel | desktop + phone |
| `6d` | Grant a standing exception (scope / rules / reason / expiry) | desktop panel |
| `7a` | Identity-change request submission | phone |
| `7b` | Identity-change approval queue, old vs proposed | desktop |
| `7c` | Reject with mandatory reason | desktop panel |
| `8a` `8b` | Exceptions / violations list, approve + bulk approve | desktop + phone |
| `8c` | Daily report, live filters, export | desktop |
| `8d` | Dashboard: supervisor scope vs directorate scope, side by side | desktop ×2 |
| `8e` | Dashboard | phone |
| `8f` | Stations directory | desktop + phone |
| `9a` | Administration → Accounts, incl. who may create which role | desktop |
| `9b` | Administration → System settings (the rule thresholds) | desktop |
| `9c` | Administration → Exception types (admin-managed, not hardcoded) | desktop |
| `9d` | Administration → Audit log, read-only, sentence-per-entry | desktop |
| `10a` | **Dark mode colour map** — day → night, per role | reference |
| `10b` `10c` | Dark: fill-up recording, rule violation — ⚠️ `10b` still shows the driver step; take its **colour mapping** only, its layout from `12a` | phone |
| `10d` | Dark: station dashboard | desktop |
| `10e` | Dark: vehicles table + system settings | desktop ×2 |
| `11a`–`11c` | **Plate input**, three approaches — ship `11b` | field close-ups |
| `11d` | Plate input: five states (empty / 2-digit / complete / incomplete / unregistered) | field close-ups |
| `11e` | Plate step on the full screen, numeric keypad | phone |
| `12a` | **Fill-up journey, happy path** — plate → fuel+qty → review → done | phone ×5 |
| `12b` | Journey, violation branch — rule shown, exception written, pending confirmation | phone ×2 |
| `12c` | Journey, unregistered-vehicle branch — no match → vehicle identity → **owner** → back to the fill-up | phone ×3 |
| `12d` | **Journey on desktop** — one screen, all steps, live rule rail | desktop |
| `12e` | Desktop, violation — rail marks the one failing rule, exception form inline | desktop |
| `12f` | Desktop, confirmation beside the live day list | desktop |
| `13a` | **Vehicle QR** on vehicle detail — code beside the QR, one-step share | phone |
| `13b` | Post-share confirmation, inline banner | phone |
| `13c` | Vehicle QR on vehicle detail — honest two-step share (download, then open chat) | desktop |
| `13d` | **Fill-up success, compact QR** — new-vehicle variant beside the unchanged registered-vehicle variant | phone ×2 |
| `13e` | Fill-up success, compact QR rail | desktop |
| `14a` | **Scan-in at the plate step** — offer, pre-permission sentence, viewfinder | phone ×3 |
| `14b` | Scan success (digits fill in) + both failures | phone ×3 |
| `14c` | Scan offer + in-page scanner panel | desktop ×2 |
| `14d` | Scan success + both failures side by side | desktop ×3 |

## Round 4 — scanning the QR back in (`14a`–`14d`)

**Not a new step.** Scanning is a second route to identify the vehicle *inside* the existing plate-entry step. The 3-segment progress bar is unchanged, and both routes converge on the same match card before anything irreversible happens.

**The offer** — on phone, a full card with the same 2px teal border and weight as the digit entry, separated by an «أو» rule: two equal routes, not a primary and a buried secondary. On desktop it's a third of the identification card with a vertical «أو» rule, since a desktop webcam is the less likely route and needs its case made.

**Before the camera opens** — one procedural sentence, because nothing in this system has requested camera access before: «تُقرأ صورة الرمز على الجهاز نفسه ولا تُحفَظ ولا تُرسَل. سيسألك جهازك عن الإذن بعد ضغط الزر» — it answers where the image goes and what the next tap does, and offers the typing escape before the OS prompt fires.

**Scanning** — phone: full-screen dark viewfinder, amber corner brackets, and the abandon route as a **full-width white button**, not an icon; abandoning is the time-critical action with cars waiting. Desktop: an in-page panel over the form, so a half-filled form is never lost.

**Success is not a confirmation screen.** The digits land in the same boxes typing would have filled, tinted green, with the scanned internal code named above them and «تعديل يدوي» still available — a scan can be of the wrong vehicle's paper. Flow then continues into the existing match card.

**Two failures, different in kind** — not one message with two texts:
- *Camera denied or unavailable* — a dead route. The screen rebuilds around manual entry with the field already highlighted amber, plus the booklet/chassis search and a line saying a retry is possible once permission is granted.
- *Unrecognised code* — a live route with a bad input. The camera stays open (dimmed), the read code is quoted back («الرقم المقروء: V-SB-9971»), and «مسح آخر» sits beside the manual escape.

Implementation note: decode client-side; treat a decoded string that isn't a known internal code as the unrecognised-code state, not a generic error.

## Round 3 — vehicle QR + share (`13a`–`13e`)

**What the QR carries: the internal code alone.** Not the plate (plates change; a baked-in plate goes stale) and not a link (the record needs a login, so a link does nothing for an outside scanner). The internal code is also always printed beside the QR in legible text — 21–27px, the largest text in the card — because it is the fallback when a scan fails, not a caption.

**Two homes, and only two:**
- **Vehicle detail** (`13a`, `13c`) — the permanent home, for every vehicle at any time, as a third tab beside «الهوية» and «اللوحات».
- **Fill-up success screen** (`13d`, `13e`) — a compact version, **only when this transaction created the vehicle inline**. An already-registered vehicle's success screen is unchanged; `13d` draws both variants side by side so the condition is unambiguous. In the new-vehicle variant the day-count card collapses to one line to make room, and the secondary action becomes «صفحة المركبة الجديدة» since a new record still needs its chassis and year. **Nothing before submission changes** — `12a`–`12e` stay exactly as drawn.

**Share is two different behaviours, never one button:**
- **Phone** — one action hands the image to the OS share sheet (not ours to design). Confirmation is an inline banner (`13b`), not a dialog: the user already left the app and came back, so a dismissable modal would be a third interaction for no information. The banner also states that sharing is **not** written to the audit log — every other action in this system is, so the absence needs saying.
- **Desktop** — two numbered steps: download (confirming its own filename, `V-SB-1042.png`, so the person knows what to attach) then open the chat. The prefilled message repeats the internal code in words, so a forgotten attachment still carries the useful part. The compressed 400px rail in `13e` keeps the numbering for exactly that reason.

«نسخ الرقم» sits apart from sharing on both widths — reading the code aloud over a phone call is the likeliest real use.

Implementation note: generate the QR client-side from the internal code. The artboards draw a representative 21×21 module pattern, not a real encoding.

## The fill-up journey (build this first — `12a`–`12f`)

The journey is the product; everything else is support. Same steps, same rules, same Arabic copy on both devices — only the division differs, so nobody learns two systems.

> **Scope now: vehicle + owner.** No driver anywhere in the journey — the driver step is gone, driver fields are gone from the match card, review, and confirmation, and the driver-to-vehicle rule check is gone from the rule set. **Owner IS in scope**: it displays on every matched vehicle and is captured when a new vehicle is created. The journey is **three steps on phone, two on desktop**. Driver capture is a later phase; the screens in `6a`–`6c` stay as reference for when it returns.
>
> **`12a`–`12f` are the fill-up screens to build.** They supersede `4a`–`4c` and the layout of `10b`, all of which predate this scope change and still draw a driver step. Where the two disagree, 12 wins.

### Owner

**On match** (`12a`, `12d`, `11d`) — the owner is the headline fact under the vehicle name, with an ownership-type pill («ملكية حكومية» / «ملكية خاصة»), then booklet and chassis numbers beneath it. It carries through review («من سجل المركبة» — read-only, not editable in the fill-up) and both confirmation screens.

**On create** (`12c`, step 2 of 2) — ownership type first, because it decides the rest: **حكومية** asks for the owning body (picker over registered bodies, free text creates a new one) and dims the national-ID field with «لا يلزم الأن»; **خاصة** requires owner name + 12-digit national ID. Phone number is optional on both. The quick-add is now two steps — vehicle identity, then owner — and still returns to the interrupted fill-up.

**Phone** — one decision per screen, three steps, progress bar segments turn green behind the user:
1. **Plate** (`12a`, `11e`) — segmented field per `11b`, numeric keypad only so no invalid character can be typed. Matching is instant on completion; the match card names the vehicle, its **owner and ownership type**, and its booklet and chassis numbers — confirmation that the right record was found.
2. **Fuel + quantity** — 3-way fuel segment, ±steppers with 3 quick values, the vehicle's own limit shown beside the label. Station and timestamp are marked «تلقائي» and are not editable.
3. **Review** — every row tappable to edit, then the rule check as **three named checks with their real numbers**. A compliant fill-up is confirmed as compliant, not merely allowed.

Then the confirmation screen: record number, the facts, «تعبئة جديدة» as the primary action.

**Desktop** (`12d`) — the same two numbered steps all visible at once, plus a 340px right rail that re-checks all three rules on every change (no submit-to-find-out) and shows this vehicle's recent fill-up history beneath it. The phone's review step becomes that permanent rail.

**The three rules checked** (both devices): interval since this vehicle's last fill-up · fill-ups this week against the cap · quantity against the vehicle's per-fill limit.

**Violation branch** (`12b`, `12e`) — the violation replaces the green check *in place*; the summary stays above it so no work is lost. Desktop marks only the failing rule and keeps the other two visible («قاعدة واحدة من ثلاث»). The exception form is inline: type, order/assignment number (desktop), mandatory reason. The confirmation turns **amber, not green**, and lists what happens next in three steps ending with «لا حاجة لمتابعته منك» — the sentence that stops an anxious employee re-recording the same fill-up.

**Unregistered-vehicle branch** (`12c`) — the dead end becomes three named exits, with «تصحيح الرقم» *before* «إضافة مركبة» because a typo is likelier than an unregistered vehicle. Quick-add asks only what identifies the vehicle (plate carried over, booklet number, usage type), says so explicitly, then returns to the interrupted fill-up — not to a vehicle page.

Desktop-only affordances: print receipt, «إفراغ الحقول». Phone-only: numeric keypad, per-step back arrow.

## Content rules (non-negotiable)

- **No internal identifiers on screen — at all.** Not alone, and not paired with an Arabic translation either (that was an earlier instruction; it was superseded). If a state has no written Arabic label in `1b`, it is not ready to display. Rule violations read as one plain Arabic sentence (e.g. «لم يمر وقت كافٍ منذ آخر تعبئة لهذه المركبة»).
- **Every field carries a hint line** under it, in plain Arabic, describing the expected shape (plate = municipality code before the dash, serial after; national ID = 12 digits; chassis = 17 characters, no I/O/Q; datetime = taken from the device, not editable).
- **Dates and durations in words** where a person must act on them: «أمس ٢:٢٠ مساءً», «يومان», «يوم واحد» — not raw timestamps in the reading path.
- **Numbers**: Western numerals inside `dir="ltr"` + `unicode-bidi:isolate` for plates/IDs/quantities/timestamps; Arabic-Indic numerals in prose counts («ستة بانتظار اعتمادك»). Keep that split.
- **Station internal codes (SB-04) stay visible** — real operational data staff say out loud. Rule/enum identifiers do not.
- **Masked national IDs** are the default everywhere; revealing is permission-gated and writes an audit-log entry (see `9d`).
- **Pending identity changes never take effect.** The old value stays authoritative, labelled «لم يسرِ بعد» on the request, in the queue, and on the vehicle record.
- **Nothing is deleted.** Plate history, retired exception types, expired standing exceptions all stay visible in a dimmed/retired state.

## Accessibility baseline (station staff skew older, low digital literacy)

- Body text ≥ 13px desktop / ≥ 12.5px phone; field labels 700 weight; screen titles 900.
- Every action pairs an icon with its Arabic word — never icon-only.
- Quantity uses +/− steppers (≥46px circular targets), not free numeric entry.
- Phone touch targets ≥ 46px; primary CTAs 54–58px tall.
- Status is never colour-only: every pill and strength meter carries text.
- Prefer stating the absence of a problem («لا توجد قاعدة تمنع هذه التعبئة») over silence.

## Design tokens — light

```css
--ink:#132524; --ink-soft:#5B6D6A; --ink-faint:#93A19E; --line:#E3E7E2;
--bg:#F7F5EF; --surface:#FFFFFF; --surface-alt:#EEF2EE;
--primary:#0D5C52; --primary-dark:#0A4841; --primary-100:#E3EFEC;
--accent:#E8A53D; --accent-dark:#B97A1A; --accent-100:#FBEDD4;
--danger:#C1462D; --danger-dark:#8F3120; --danger-100:#FBE6E0;
--ok:#1F7A5C; --ok-100:#E2F2EA;
--r-sm:10px; --r-md:16px; --r-lg:24px; --r-pill:999px;
--s1:0 1px 2px rgba(19,37,36,.06),0 1px 1px rgba(19,37,36,.04);
--s2:0 8px 24px -8px rgba(19,37,36,.18);
--s3:0 20px 48px -12px rgba(19,37,36,.28);
```

## Design tokens — dark (see `10a`)

```css
--bg:#0F1E1C; --surface:#16302B; --surface-alt:#1E3D36; --line:#254842;
--ink:#EDF6F3; --ink-soft:#9FB6B0; --ink-faint:#6F8781;
--primary:#2BA894; --primary-100:#123C35;
--accent:#F0B457; --accent-100:#3A2A12;
--danger:#FF6B52; --danger-100:#3D1C16;
--ok:#3FCB93; --ok-100:#12352A;
--shadow: 0 1px 2px rgba(0,0,0,.4) / 0 10px 28px -10px rgba(0,0,0,.7);
```

Dark-mode rules, all visible in `10a`–`10e`:
- **Surfaces and text invert; colour meaning does not.** Each hue is lightened for contrast on dark — never swapped for a different hue, never used at its light-mode value.
- **Three surface levels replace shadow separation** (page → card → element-in-card), because shadows stop separating on dark.
- **Amber buttons take dark ink** (`#1E1305`), not white — **in both modes**. White on `#E8A53D` measures 2.13:1 and fails even the large-text bar; dark ink measures 8.59:1. This applies to amber fills everywhere: primary CTAs, amber state badges, the amber "needs your decision" card. Teal buttons take the page background as their text colour.
- **`--ink-faint` is for non-text decoration only** (dividers, disabled glyphs). It measures 2.68:1 on white, so placeholders, hint lines and timestamps use `--ink-soft` (5.47:1) instead — these carry the text a first-time user most needs.
- **Desktop sidebar goes darker than the page** (`#0A1614`), not lighter, so light mode's hierarchy is preserved; the active nav item switches from translucent white to a teal tint (translucent white greys out on dark).
- Table header rows use the third surface level, not a grey; the amber "unsettled" row tint becomes a dark amber wash.

## Shared layout conventions

`dir="rtl"` throughout. Desktop = 236px dark teal sidebar (right) + content; role-scoped users get their station fixed in the page header, never a picker. Mobile = per `2a`; KPI figures are individual rounded cards, tables become cards.

**Type**: **Cairo** only (weights 400–900), Arabic and Latin alike. Round 1's second font is dropped — codes are set in Cairo with `dir="ltr"` isolation, so the app ships one font.

**Focus state** (required, not drawn): 2px `--accent` outline, 2px offset, on every interactive element.

**Colour meaning is fixed**: teal = brand/structure/selection · amber = the one primary action, and pending/unsettled state · red = a broken rule, nothing else · green = approved/compliant. Do not add a second accent hue.

## Files
- `CLAUDE-CODE-PROMPT.md` — **the paste-in prompt for an implementation session (start here)**
- `Fuel Control System - Round 2 Screens.dc.html` — the screen set (build from this)
- `Fuel Control System - Design Directions.dc.html` — Round 1, history only
- `design-system-notes.md` — condensed token/rule summary
