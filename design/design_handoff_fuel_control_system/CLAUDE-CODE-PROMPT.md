# Prompt for Claude Code — implement design rounds 3 & 4

Paste this whole file as your first message. It assumes you are working in the `South Petrol Stations Portal` repo with `CLAUDE.md`, `docs/IMPLEMENTATION_PLAN.md`, and `docs/OPEN_ITEMS.md` already in context.

---

## What this is

The design track has produced two new rounds and corrected one earlier instruction. **Most of rounds 1–2 is already implemented** in `apps/web/src` — this is not a rebuild. Read the delta below, then implement only what's new or wrong.

**Source of truth for visuals:** `design/Fuel Control System - Round 2 Screens.dc.html` — open it in a browser. It is a design reference, not production code: inline styles exist because the mockup tool requires them. Build in Tailwind, using the components already in `apps/web/src/components/design/`.

Every option id below (`12a`, `13c`, `14b`…) is a visible badge in that file. `design/README.md` holds the full screen index, tokens, content rules and accessibility baseline. Read it before starting.

---

## Correction to an earlier rule — apply this first

`apps/web/src/features/fillups/ruleViolationMessages.ts` carries this comment:

> *"a system code must never stand alone — paired with its Arabic meaning wherever it's shown."*

**That rule was superseded and is wrong.** The current rule is stronger: **a raw code, enum value, or internal identifier is never shown to a user at all** — not alone, not paired with a translation. `RULE_VIOLATION_MESSAGES` / `RULE_CHECK_LABELS` are correct as written (internal keys, Arabic values); what must not happen is rendering the key itself anywhere in the UI. Grep for any place a `RuleFailureReason`, `ExceptionType.code`, setting key, or similar reaches the DOM and remove it. Fix the comment so the next session doesn't reinstate the old behaviour.

Exception: `Station.internalCode` and `Vehicle.internalCode` **are** user-facing — they are real operational identifiers staff read aloud. Rule/enum identifiers are not.

---

## Round 3 — vehicle QR code + share (`13a`–`13e`)

**What the QR carries: `vehicle.internalCode` and nothing else.** Not the plate (plates change; `internalCode` is the durable key per `CLAUDE.md` rule 1) and not a URL (the record needs auth, so a link is useless to an outside scanner). Generate client-side.

**Two homes, and only two:**

| Where | Artboards | File |
|---|---|---|
| Vehicle detail — permanent, every vehicle, any time | `13a` phone, `13c` desktop | `features/vehicles/VehicleDetailPage.tsx` |
| Fill-up success — compact, **only when this transaction created the vehicle inline** | `13d` phone, `13e` desktop | `features/fillups/RecordFillUpPage.tsx` |

`13d` deliberately draws both success-screen variants side by side: an already-registered vehicle's success screen is **unchanged**. Gate the QR block on "this submission created a new vehicle", not on "the vehicle has a code" (every vehicle has one).

**Required in the block, not just the QR image:** the internal code printed beside it in legible text at 21–27px — the largest text in the card. It is the fallback when a scan fails, not a caption. «نسخ الرقم» is a separate affordance from sharing, because reading the code aloud over a phone call is the likeliest real use.

**Share is two different behaviours — never one button:**

- **Phone** — one action hands the PNG to the OS share sheet (`navigator.share` with a file; the sheet itself is not ours to design). Confirmation is an **inline banner** (`13b`), not a dialog: the user already left the app and came back, so a dismissable modal is a third interaction for no information. The banner also states that sharing is *not* audited — every other action in this system writes an `AuditLog` row (`CLAUDE.md` rule 6), so the absence needs saying. **Do not** write an audit row for sharing.
- **Desktop** — two numbered steps, drawn honestly: (1) download the PNG, confirming its own filename (`V-SB-1042.png`) so the person knows what to attach; (2) open the WhatsApp compose link. A short procedural sentence says the attachment is manual. The prefilled message repeats the internal code in words, so a forgotten attachment still carries the useful part. `lib/download.ts` already exists — use it.

Feature-detect rather than sniffing the user agent: if `navigator.canShare({files})` is true, render the phone treatment; otherwise the two-step. A tablet can legitimately get either.

---

## Round 4 — scanning that QR back in (`14a`–`14d`)

**Not a new step.** Scanning is a second route to identify the vehicle *inside the existing plate-entry step*. The 3-segment progress indicator is unchanged — do not add a segment. Both routes converge on the same match card (`VehiclePreviewCard.tsx`) before anything irreversible happens.

| State | Artboards |
|---|---|
| The offer, beside digit entry | `14a`¹ phone, `14c`¹ desktop |
| Pre-permission sentence | `14a`² phone (desktop: inline in the offer panel) |
| Live viewfinder + instant escape | `14a`³ phone, `14c`² desktop |
| Success — digits fill in, flow continues | `14b`¹ phone, `14d`¹ desktop |
| Camera denied/unavailable | `14b`² phone, `14d`² desktop |
| Code matches no vehicle | `14b`³ phone, `14d`³ desktop |

**The offer.** On phone: a full card with the same 2px teal border and weight as the digit entry, separated by an «أو» rule — two equal routes, not a primary and a buried secondary. This is the most-used screen in the system; a scan styled as a secondary link would never get used. On desktop: a third of the identification card with a *vertical* «أو» rule, since a desktop webcam is the less likely route and needs its case made.

**Before the camera opens** — one procedural sentence, because nothing in this system has requested camera access before and a cold OS prompt gets declined:

> ستُستخدم الكاميرا لمسح رمز المركبة
> تُقرأ صورة الرمز على الجهاز نفسه ولا تُحفَظ ولا تُرسَل. سيسألك جهازك عن الإذن بعد ضغط الزر.

It answers where the image goes and what the next tap does, and offers the typing escape **before** `getUserMedia` is ever called.

**Scanning.** Phone: full-screen dark viewfinder, amber corner brackets, and the abandon route as a **full-width white button** — not an icon. With cars waiting, abandoning is the time-critical action. Desktop: an in-page panel over the form so a half-filled form is never lost.

**Success is not a confirmation screen.** The digits land in the same `DigitBoxInput` boxes typing would have filled, tinted green, with the scanned internal code named above them and «تعديل يدوي» still available — a scan can be of the wrong vehicle's paperwork. Then the existing match card renders as usual.

**Two failures, different in kind — not one message with two texts:**

- *Camera denied or unavailable* — a dead route. The screen rebuilds around manual entry with the plate field already highlighted amber, the booklet/chassis search still offered, and a line noting a retry is possible once permission is granted.
- *Unrecognised code* — a live route with a bad input. The camera stays open (dimmed), the decoded string is quoted back («الرقم المقروء: V-SB-9971») so the employee can see it scanned *something*, and «مسح آخر» sits beside the manual escape.

Treat any decoded string that isn't a known `internalCode` as the unrecognised-code state, never a generic error toast.

---

## Also verify against the current design (not new work, but drifted)

- **Owner on match.** `12a`/`12d` show the owner as the headline fact under the vehicle name with an ownership-type pill, then booklet + chassis beneath. It carries through review (marked «من سجل المركبة» — read-only) and both confirmation screens. Check `VehiclePreviewCard.tsx` matches; see also `docs/DESIGN_owner_based_fillups.md`.
- **Driver is out of scope** for the fill-up journey — no driver step, no driver fields, and no driver-to-vehicle rule check. Your `DRIVER_* → OWNER_*` rename already reflects this. Artboards `6a`–`6c` (drivers directory/detail) are **deferred, not cancelled** — leave the routes and types in place.
- **`4a`–`4c` and the layout of `10b` are superseded** by `12a`–`12f`. They still draw a driver step. Where they disagree with section 12, section 12 wins. Take `10b`'s *colour mapping* only.
- **Dark mode** (`10a`–`10e`) is specified but `index.css` has no custom properties yet. When you implement it: surfaces and text invert, hue does not — each colour lightens for contrast rather than being swapped. Three surface levels replace shadow separation. Amber buttons take dark ink `#1E1305` in **both** modes (white on amber measures 2.13:1 and fails even the large-text bar). Full mapping in `10a` and `design/README.md`.
- **Contrast floor.** `--ink-faint` (`#93A19E`) is decoration only — dividers and disabled glyphs. Placeholders, hint lines and timestamps use `--ink-soft` (`#5B6D6A`). Anything a first-time user needs to read is ≥4.5:1.

---

## Suggested order

1. The code-leak correction and its stale comment — smallest change, removes a live content bug.
2. Round 3 vehicle-detail QR (`13a`, `13c`) — self-contained, no fill-up risk.
3. Round 3 success-screen QR (`13d`, `13e`) — touches `RecordFillUpPage` but only after submission.
4. Round 4 scan-in (`14a`–`14d`) — touches the highest-traffic screen; do it last, behind the feature-detect so a device without a camera never sees the offer.

Per `CLAUDE.md`: one phase per branch, and run the phase's own "done means" checklist before calling it done. The station-scoping boundary test still applies to anything touching fill-ups.
