# Phase 6, Part B: contrast, finding things, errors and feedback

Presentation only: no API contract changed in Part B. Screenshots (desktop and
390 px, and a simulated weak screen) are in `docs/ux-round-screenshots/phase6-partB/`.

## B1. Contrast

`node scripts/contrast-check.mjs` reads the tokens from `tailwind.config.js` and
fails if any pair is under 4.5:1 (text), 3:1 (UI boundary). The table is
`docs/contrast-table.md`.

| What | Before | After |
|---|---|---|
| Page background | `#F7F5EF` beige, 1.09:1 against a white card | `#E4EBE9` grey-teal, 1.24:1, and the card has a 3:1 edge |
| Field and card edge (`line`) | `#E3E7E2`, **1.25:1** on white (fails 3:1) | `#6A7C79`, 4.4:1 on white, 3.6:1 on the page, 4.0:1 on a field |
| Fields | a pale fill, most with no border at all | every field has a 1px edge (index.css, once) |
| Faint text (`ink-faint`) | `#93A19E`, **2.7:1** on white, 2.5:1 on the page (fails 4.5:1) | `#566866`, 5.9:1 and 4.9:1 |
| Secondary text (`ink-soft`) | 5.5:1 | 7.4:1 |
| Row dividers in tables | the same colour as a field fill (invisible) | `line-soft` `#CBD5D2`, decorative only |

The brand (teal, amber, Cairo) and the colour meanings are unchanged: red stays
for broken rules and irreversible actions, and every status still has a word.

Weak-screen check: `weak-*.png` in the screenshot folder are the home, exceptions,
registration and settings screens through `contrast(0.8) brightness(0.88)`.

## B2. Finding things

Top tasks per job, and the clicks to reach each (from the home screen, which is
what a person sees after signing in; a phone adds the menu button):

| Job | Task | Before | After |
|---|---|---|---|
| Station employee | Record a fill-up | 1 | 1 (the first card) |
| Station employee | See today's fill-ups | 1 (التقرير اليومي) | 1 («اليوم») |
| Station supervisor | Record a fill-up | 1 | 1 (first card) |
| Station supervisor | Review exceptions | 1 + approve each | 1, nothing to approve (no approval step) |
| Station supervisor | Today's numbers | 1 | 1 |
| Municipality manager | Directorate numbers | 1 (dashboard) | 0 extra: the lower half of «اليوم» |
| Municipality manager | Exceptions station by station | did not exist | 2 («الاستثناءات» then «حسب المحطة») |
| Municipality manager | Define an exception type | not possible | 1 («القوائم») |
| Super admin | Exception types | 2 (الإدارة then a tab) | 1 («القوائم») |
| Super admin | Strict switch / threshold | did not exist | 2 (الإدارة, الإعدادات) |
| Registration employee | Register a vehicle | 1 | 1 |
| Registration employee | Find a vehicle | 1 | 1 |
| Office manager | Their office | 1 | 1 |

What changed: the home screen puts each job's daily cards first, in task order
(`lib/homeOrder.ts`, with a test); the dashboard no longer needs its own
destination; one «القوائم» page; every top task is at most 2 clicks.
Pages touched now carry a one-line purpose (exceptions, the day, lists).
Desktop productivity: Enter searches the owner on the registration form; the
exceptions filters are remembered per user on the device (`usePersistedState`).

## B3. Errors, feedback, confidence

- `lib/apiError.ts`: one place where an API failure becomes an Arabic sentence
  that says what happened and what to do; the area helpers (admin, cards,
  registration, the pump) fall back to it, so an unmapped code never shows raw.
  Unit-tested (`apiError.test.ts`).
- `components/NetworkBanner.tsx`: a calm banner when the server cannot be reached
  or the browser is offline, saying nothing was saved, with a retry; it clears on
  the next successful request. Covered by `partb.spec.ts`.
- `components/design/Skeleton.tsx`: used on the exceptions list; the other lists
  still show their text loading line.

## Not done in this pass (said plainly)

- Skeletons are on the exceptions list only; the other lists keep «جارٍ التحميل».
- The first-error-focus on submit and keeping entered data on every error are
  only as good as the existing forms (react-hook-form screens do both; the older
  hand-written forms were not rewritten).
- «Before» screenshots are the committed `docs/phase-5*-screenshots`; there is
  no fresh "before" capture of every screen.
- The 12-box identity-number row still overflows slightly at 390 px on the
  registration screen (visible in `registrar-02-registration-390.png`).
- The impeccable detector reports 7 existing `side-tab` anti-patterns
  (a thick coloured side border on a card) in older screens, and advisory notes
  about off-ramp font sizes on the pump figures; not changed here.
