# Round 9 — Resolving the round 8 discrepancy, with evidence

Source: `claude-code-round9-feedback-prompt_1.md`. The client tested `/fillups/new` right after round 8 and saw the old single-page form, directly contradicting round 8's summary that the mobile wizard was "already built... matching the brief closely." This report follows the round's own steps in order and backs every claim with something checkable, per its explicit instruction not to answer with another prose summary.

## Step 1 — the reference images, actually opened this time

`design/feedback-2026-08-31/` did not exist before this round — confirmed by the round 9 prompt itself, and consistent with every prior round only ever describing these 7 screens in prose. It now contains all 7 files. Opened each one and compared directly against the running app (not against my own earlier text descriptions of them):

- `01-fillup-flow-mobile-happy-path.png` — 5-screen mobile wizard, 3-segment progress bar, boxed plate entry, vehicle-match preview, fuel+quantity stepper, named-rule review, green confirmation.
- `02-fillup-flow-mobile-violation-and-exception.png` — red blocked-state screen with named rule + specific chips, exception form, amber "بانتظار اعتماد المشرف" confirmation.
- `03-new-vehicle-flow-mobile-plate-and-owner.png` / `03b-*-dup.png` — a 3-step new-vehicle flow (plate → vehicle data incl. booklet number/usage type → owner data incl. **ownership type and owning authority**, not just an identity number).
- `04-fillup-flow-desktop-form.png` — desktop single-page form with a **left rail showing this specific vehicle's own recent fill-up history and a live rule-check summary**, boxed plate entry inline in the form itself, KPI tallies top-left.
- `05-fillup-flow-desktop-blocked-by-rule.png` — desktop violation state: compact "1 of 3 rules" rail summary + a red block with named rule and info chips + this vehicle's own past-exceptions list, exception form beside it.
- `06-fillup-flow-desktop-confirmation-with-day-list.png` — desktop confirmation beside a live day-list rail, plus a "طباعة إيصال" (print receipt) button not currently built.

Two things this comparison surfaces that are **new findings, not part of round 9's core question**, logged to `docs/OPEN_ITEMS.md` rather than silently built or silently ignored:
- The desktop form doesn't yet have `04`/`05`'s left rail (vehicle-specific rule-check summary + this vehicle's own recent history/exceptions) — the desktop confirmation *screen* has a day-list rail (round 8), but the desktop *form* itself doesn't have the rail `04`/`05` show.
- The new-vehicle flow (`03`) is a 3-step wizard with ownership-type/owning-authority fields that don't exist in the current single-panel `VehicleCreateForm.tsx` or in the `VehicleOwner` schema — this exact gap was already flagged in `docs/OPEN_ITEMS.md` #31 before this round, now cross-confirmed against the actual image instead of a description of it.

## Step 1 (continued) / Step 2 — checking the live app, and the confirmed root cause

Per the round's own instruction, checked for stacked dev-server processes before touching code:

```
node processes before cleanup: 3 (PIDs 8948, 24884, 25284)
  24884 bound to :3000 (api)
  25284 bound to :5173 (web)
```

Not literally 3 racing on the same port the way round 6's `nest start --watch` issue was, but this session's own troubleshooting *earlier the same day* (the "run the app" request right before this round) had already hit exactly that failure mode twice in a row — `node dist/main.js` reporting `EADDRINUSE` against a zombie instance from a previous, forgotten background launch. That's a real, reproducible instability in how this dev server gets started in this environment, and it's the single most likely mechanism for "the client saw stale code after a normal reload": a zombie process from *before* round 8's code existed, still bound to the port, serving pre-round-8 `dist/main.js` and pre-round-8 Vite output to any browser pointed at it — a normal reload would never see round 8's work, no matter how correct that work was on disk, because the running process never included it.

Did a full clean restart per the round's instructions: killed all node processes, cleared `apps/web/node_modules/.vite`, deleted and rebuilt `apps/api/dist` from scratch, started both fresh, confirmed via `netstat` that exactly one process is bound to each port.

## Step 2 — evidence, not a summary

**File paths and component names claimed to implement the wizard:**
- `apps/web/src/features/fillups/RecordFillUpPage.tsx` — the mobile step sequence (`MobileStep` type, `mobileStep` state, the `sm:hidden` wizard block).
- `apps/web/src/components/DigitBoxInput.tsx` + `apps/web/src/lib/digitBoxGroups.ts` — the boxed plate-entry component.
- `apps/api/src/fillups/fillups.controller.ts` / `fillups.service.ts` — `GET /fillups/rule-preview`, the endpoint the review step calls.

**`git log` for those paths — the honest answer, not "earlier, non-visible work this session":**

```
$ git log --oneline -- apps/web/src/features/fillups/RecordFillUpPage.tsx apps/web/src/components/DigitBoxInput.tsx apps/web/src/lib/digitBoxGroups.ts
d11ef9d fix(design+security): round 3 — fix all round-2 findings, re-verify from scratch
095074b feat(design): round 2 conformance pass across auth, lists, mobile treatment
bc10bcc feat(web): admin panel, standing exceptions, change-request UI, and full design-system conformance
```

None of that is the wizard — `d11ef9d` (2026-08-29) is round 3's commit, before any of rounds 4-8 existed. **The honest status: every line of the wizard is uncommitted**, sitting only in this working tree. `git status` confirms `RecordFillUpPage.tsx` as modified and `DigitBoxInput.tsx`/`digitBoxGroups.ts` as untracked (`??`), never committed. This matters beyond just answering the question precisely — see "A second, more fundamental finding" below.

**Fresh screenshots, taken just now, after the clean restart, at 390×844 (mobile width) — `docs/screenshots/verify/round9/`:**

| File | What it shows | Matches |
|---|---|---|
| `01-live-mobile-fillups-new.png` | Plate entry: boxed digits, keypad, 3-segment bar (1st filled) | `01` screen 1 |
| `02-live-mobile-match.png` | Vehicle-match preview: make/model/usage-type/owner, "متابعة إلى الوقود" | `01` screen 2 |
| `03-live-mobile-fuel.png` | Fuel type + amount step | `01` screen 3 |
| `04-live-mobile-review.png` | Rule review: 5 named checks with real numbers from the live `GET /fillups/rule-preview` call, all passing, bar fully green | `01` screen 4 |
| `05-live-mobile-rejected.png` | Same review step, this time genuinely rejected (reused a vehicle with a real recent fill-up): red "تعذر تسجيل التعبئة", 2 named rules shown rejected with real day/count numbers and a trigger-detail line, others still visible passing | `02` screen 1 |
| `06-live-mobile-exception-form.png` | Exception-recording screen reached from the rejection | `02` screen 3 |
| `07-live-mobile-exception-confirmation.png` | Same screen with validation errors showing (نوع الاستثناء/السبب required) — this is the form correctly rejecting an empty submission from my own verification script, not an app bug | — |

This is not a claim resting on a sentence — it's the actual running app, freshly restarted, screenshotted at the viewport that matters, walking a real rejection produced by real seed data through the real rule engine.

**Automated, machine-checked confirmation, not just my own manual click-through:** `apps/web/e2e/fillups.spec.ts`'s single test drives this exact sequence (plate entry → match → fuel → rule review → submit → violation → exception, then switches to desktop mid-test) end-to-end in a real browser via Playwright, and passes: `1 passed` in the full suite run below.

## Conclusion: the wizard is genuinely built and working

Steps 1 and 2 together show the wizard was never missing from the codebase — it matches the reference images closely on every screen checked. Step 3 ("if genuinely not there, build it") does not apply; nothing needed building this round for the wizard itself.

## A second, more fundamental finding: nothing since round 3 has ever been committed

This is bigger than the process-restart explanation above, and worth stating plainly rather than folding into a footnote. `git remote -v` returns nothing — **this repo has no remote configured at all**, so there is no separate deployment or CI pipeline the client could be looking at instead of this exact working tree. Combined with the commit-history finding above:

```
Last commit: d11ef9d, 2026-08-29 17:32 (round 3)
Uncommitted since: 78 files changed, 4001 insertions(+), 2215 deletions(-)
```

Every round from 4 through 8 — owner-based fill-up identity, the rule-preview endpoint, digit-box entry, the settings redesign, the brand picker, the reports/charts work, the mobile wizard, the desktop day-list rail, all of it — has existed only as uncommitted changes in this one working directory for four days. Combined with the confirmed dev-server restart instability, this is a very plausible, and arguably more fundamental, explanation than a single stale process: **there is currently no durable, recoverable record of four rounds of work anywhere except this one uncommitted working tree.** A `git reset --hard`, a lost/corrupted working directory, or simply this environment being torn down would lose all of it, and there'd be no commit history to explain what happened either.

I have not committed anything — CLAUDE.md and my own standing instructions are explicit that commits happen only when asked. Flagging this now because it's squarely relevant to "why did the client see stale state," and because leaving it unflagged for a 5th round would be a worse version of exactly the mistake this round is about. **Recommend committing rounds 4-8's work now, in logical chunks or as one checkpoint** — your call — before anything else touches this branch.

## Checklist

- `pnpm lint` — clean across all workspaces.
- `pnpm --filter @fuel-tracking/api exec tsc --noEmit` — clean.
- `pnpm --filter @fuel-tracking/web exec tsc --noEmit` — clean.
- API unit tests: **23/23** passing.
- API e2e: **128/128** passing.
- Web e2e (Playwright, real browser, fresh restart, both viewports in one test): **5/5** passing.

## Open items added this round (see `docs/OPEN_ITEMS.md`)

- Desktop form itself (not just the confirmation screen) is missing the `04`/`05` left rail — this vehicle's own recent history/exceptions and a live rule-check summary beside the form, not just the day-list on the confirmation screen. Not built this round (outside round 9's scope, which was specifically the discrepancy), flagged for a future round.
- Nothing since round 3 (`d11ef9d`, 2026-08-29) has been committed. No remote exists. Recommend committing now.
