# Handoff: Fuel Fill-Up Control System — Visual Redesign

## Overview
A new visual direction for the Sabha Security Directorate fuel fill-up tracking system, covering the mobile fill-up flow, rule-violation handling, station/directorate dashboards, vehicle identity-change review, administration, an accessibility pass for lower-tech/older station staff, dark mode, and new vehicle/driver registration when a search comes up empty.

## About the Design Files
The bundled HTML file is a **design reference**, not production code — a set of static, hand-styled mockups built to explore layout, color, type, and interaction states. It is not meant to be copied into the app directly.

**Target environment**: the existing codebase (`South Petrol Stations Portal`) is **React + react-router-dom + TanStack Query + Tailwind CSS** (see `apps/web/src/`). Recreate these designs as real React components/pages using that stack — Tailwind utility classes (or a small set of CSS variables matching the tokens below) rather than the inline styles used in the mockup, which exist only because the mockup tool requires them.

## Fidelity
**High-fidelity.** Colors, radius, shadows, spacing, and type are final — implement pixel-close using the tokens below, not just as a rough guide.

## Screens / Views
File: `Fuel Control System - Design Directions.dc.html`, turns 2–4 (turn 1, an earlier Modernist-based direction, was explicitly rejected — ignore it).

### Turn 2 — core screens
- **2a Identity/marks** — reference only, not a screen to build; documents the palette and the "code + Arabic meaning" pairing rule.
- **2b Fill-up (single screen)** — mobile. Header (teal gradient) shows station code + name (fixed, not a picker) and today's fill-up count. Body: vehicle plate field (bidi-isolated, teal-tinted input, "matched" pill when the vehicle is recognized), driver field (prefilled from the vehicle's registered driver, "سائق آخر" to override), fuel-type segmented control (3 options, selected = solid teal... in the final 2b it's shown amber-highlighted for the selected fuel — check the file for the exact selected-state color used per screen, it varies slightly between early/late iterations, standardize on **teal fill for selection, amber reserved for the primary submit action** per the turn-3 refinement), quantity as a large numeral + 3-value quick-select. Footer: full-width amber pill CTA "تسجيل التعبئة" + helper text "تُفحص القواعد عند التسجيل".
- **2c Rule violation, inline** — the fill-up screen stays visible; a rounded amber/red-bordered violation card appears in place with: the exact fields that triggered it, a table of (last fill-up date, minimum gap, rule code), an "register as exception" sub-form (reason dropdown, free-text justification, reference number), and two footer buttons (solid red "تسجيل كاستثناء", outline "إلغاء").
- **2d Station Supervisor dashboard** — desktop. Left: dark teal sidebar (logo mark, nav items, active = translucent white pill, badge counts in amber pills, user footer). Right: white header with station name/code + search + primary CTA; 4-card KPI row (today's count, today's litres, "pending your approval" in amber tint, exception %); two-column body — approval queue (rows with approve/reject pill buttons) and a live recent-activity feed.
- **2e Identity-change review** — desktop. Card shows vehicle + "لم يسرِ بعد" amber pending pill, an old-value/new-value comparison with only the changed characters in red, requester's reason + metadata, and approve/reject actions. A teal-tinted banner states the old value stays authoritative until approved.
- **2f Fill-up, stepped** — same task as 2b split into 3 screens (progress bar + back arrow), one decision per screen — driver selection shown here as the example step.
- **2g Rule violation, modal sheet** — bottom sheet variant of 2c for a harder stop (weekly cap reached): dimmed background, sheet shows the violation, a small history table, and the same two-button footer.
- **2h Directorate Admin dashboard** — same shell as 2d, scoped to all stations; table sorted by exception rate with a progress bar per row, danger-tinted for the worst offender.
- **2i Administration** — desktop. Tabs (Accounts / Settings / Audit log). Accounts table with role + station-scope + status columns. Audit log as an append-only list, changed values highlighted (old value neutral chip, new value amber chip). Right column: numeric system settings (weekly cap, min gap days, week-start selector) each as its own card with a stepper/segmented control, ending in a "حفظ التغييرات" CTA.

### Turn 3 — accessibility + dark mode
- **3a Fill-up, accessible pass** — same screen as 2b re-tuned for lower digital literacy: larger type (~15-16px body minimum), every action pairs an icon with its Arabic label, +/− steppers instead of typed numbers for quantity, the driver-match state reads "✓ لا حاجة لإدخال شيء" instead of a badge requiring interpretation. **Apply this density/clarity standard to the whole mobile flow, not just this screen.**
- **3b Field-guidance pattern** — the reusable pattern to apply to every input in the app: bold Arabic label → an input whose value area visually shows the expected shape (segments/dots/dashes) → a plain-Arabic hint line underneath spelling out the format in words. Shown for plate, national ID, chassis number, and datetime.
- **3c/3d Dark mode** — fill-up screen and supervisor dashboard. Rule: surfaces and text invert, but hue does not — teal lightens to `#2BA894`, amber lightens slightly to `#F0B457`, danger brightens to `#FF6B52`/success to `#3FCB93` for contrast on dark. Apply the same inversion rule to every screen when dark mode is implemented, not just these two.

### Turn 4 — search miss → new record
- **4a Search, no match** — mobile. Search bar (plate/booklet/chassis), empty state with icon + plain-Arabic explanation, then two full-width buttons: amber "إضافة مركبة جديدة" (primary path) and teal-tinted "إضافة سائق جديد".
- **4b New vehicle form** — mobile, scrolls; shown here as its two scroll positions so every field is visible: plate, رقم كتيب المركبة (booklet/registration number), chassis number, vehicle type (segmented: سيارة/شاحنة/دراجة), make+model+year, owner name, owner national ID — every field carries its Arabic hint line per 3b. Ends in "حفظ المركبة والمتابعة".
- **4c New driver form** — shorter, fits one screen: full name, national ID (highlighted field, hint: prevents duplicate drivers), phone, a yes/no toggle to link the driver to the vehicle just entered.

## Interactions & Behavior
- Buttons/list rows lift slightly and gain shadow on hover; primary (amber) buttons show a soft amber glow shadow always, slightly stronger on hover.
- Approve = solid green/teal pill. Reject/destructive = outlined danger pill — never a solid-red default state; red fill is reserved for the moment a rule is actually broken (2c/2g) or a badge that must announce urgency (pending-approval KPI, "لم يسرِ بعد").
- Focus state (not yet drawn in the mockup — required in implementation): `2px solid var(--accent)` outline, 2px offset, on every interactive element.
- All numeric/code runs (plates, IDs, chassis numbers, timestamps, DB keys) are Western numerals, `font-variant-numeric: tabular-nums`, wrapped in `dir="ltr"` + `unicode-bidi: isolate` inside the surrounding RTL flow — never let these reorder.
- Every literal system code (rule identifiers like `VEHICLE_GAP_TOO_SHORT`, DB setting keys like `weekly_fillup_cap`) must appear paired with its Arabic-language meaning next to or above it — a code must never stand alone in the UI.

## State Management
Out of scope for this visual handoff — implement against the existing app's data layer (TanStack Query hooks, `RuleFailureReason` types, permission checks already in `packages/shared-types`). The mockup's content (driver names, plate numbers, rule codes) is illustrative sample data only.

## Design Tokens

```css
--primary: #0D5C52;       /* petrol teal — brand/structure */
--primary-dark: #0A4841;
--primary-100: #E3EFEC;   /* tint for selected/matched states */
--accent: #E8A53D;        /* gauge amber — primary actions ONLY */
--accent-dark: #B97A1A;
--accent-100: #FBEDD4;
--danger: #C1462D;        /* rule violations ONLY */
--danger-dark: #8F3120;
--danger-100: #FBE6E0;
--ok: #1F7A5C;             /* approved states */
--ok-100: #E2F2EA;
--bg: #F7F5EF;             /* warm paper ground */
--surface: #FFFFFF;
--surface-alt: #EEF2EE;
--ink: #132524;            /* primary text */
--ink-soft: #5B6D6A;
--ink-faint: #93A19E;

/* Dark mode — hue-preserving inversion */
--dark-bg: #0F1E1C;
--dark-surface: #16302B;
--dark-surface-alt: #1E3D36;
--dark-ink: #EDF6F3;
--dark-ink-soft: #9FB6B0;
--dark-primary: #2BA894;
--dark-accent: #F0B457;
--dark-danger: #FF6B52;
--dark-ok: #3FCB93;

--r-sm: 10px;   /* inputs, chips */
--r-md: 16px;   /* cards */
--r-lg: 24px;   /* sheets/dialogs */
--r-pill: 999px; /* buttons, tags, nav pills */

--shadow-sm: 0 1px 2px rgba(19,37,36,.06), 0 1px 1px rgba(19,37,36,.04);
--shadow-md: 0 8px 24px -8px rgba(19,37,36,.18);
--shadow-lg: 0 20px 48px -12px rgba(19,37,36,.28);
```

**Typography**: one face throughout — **Cairo** (Google Fonts) for all Arabic and Latin headings/body, weights 400/500/600/700/800. **JetBrains Mono** exclusively for literal codes (plates, IDs, chassis numbers, DB keys, timestamps) — never for prose.

**Rule of color**: teal = brand/structure, amber = the one thing to tap, red = a broken rule (and nothing else), green = approved. Don't introduce a second accent hue.

## Assets
No external images/icons beyond inline SVG line-icons (drawn ad hoc in the mockup, Lucide-style — swap for an actual icon set, e.g. Lucide, in implementation) and Google Fonts (Cairo, JetBrains Mono).

## Files
- `Fuel Control System - Design Directions.dc.html` — all mockups (turns 1–4; ignore turn 1).
- `design-system-notes.md` — condensed version of the token/rule summary above, same source of truth.
