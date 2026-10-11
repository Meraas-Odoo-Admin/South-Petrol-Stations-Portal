> **SUPERSEDED.** The canonical design rulebook is `apps/web/DESIGN.md` (with its machine-readable sidecar, `apps/web/.impeccable/design.json`). This file is kept for history only. Do not edit it.

# Fuel Fill-Up Control System — Visual Style Guide

For Claude Code: apply this to every screen, including ones not mocked in the design file, so the whole app reads as one system.

## Palette
- `--primary: #0D5C52` (petrol teal, deep) / `--primary-dark: #0A4841` / `--primary-100: #E3EFEC` (tints, hovers)
- `--accent: #E8A53D` (gauge amber — primary actions, highlights only) / `--accent-dark: #B97A1A` / `--accent-100: #FBEDD4`
- `--danger: #C1462D` (rule violations ONLY) / `--danger-dark: #8F3120` / `--danger-100: #FBE6E0`
- `--ok: #1F7A5C` / `--ok-100: #E2F2EA` (approved states)
- `--bg: #F7F5EF` (warm paper) / `--surface: #FFFFFF` / `--surface-alt: #EEF2EE`
- `--ink: #132524` (text) / `--ink-soft: #5B6D6A` / `--ink-faint: #93A19E`

Rule: red = broken rule, nothing else. Amber = call to action. Teal = brand/structure. Green = approved.

## Type
- One face throughout: **Cairo** (Arabic + Latin headings and body — no second Arabic font).
- **JetBrains Mono** only for literal codes: plates, chassis/national IDs, rule identifiers (`VEHICLE_GAP_TOO_SHORT`), DB keys (`weekly_fillup_cap`), timestamps.
- Every code is paired with its Arabic meaning next to it — never shown alone.
- Numbers: Western numerals, `font-variant-numeric: tabular-nums`, wrapped `dir="ltr"` + `unicode-bidi: isolate` inside RTL flow.

## Shape & elevation
- Radius: 10px (chips/inputs), 16px (cards), 24px (sheets/dialogs), pill (buttons, tags, nav pills).
- No hard rules/borders as primary structure — surfaces float on `--shadow-sm/md/lg`, separated by radius + shadow, not dividers.
- Primary buttons: pill shape, amber gradient fill, soft amber glow shadow.
- Secondary/ghost buttons: pill, no fill, ink-soft text.

## Interaction
- Buttons/rows lift slightly + gain shadow on hover; primary CTA gets a soft amber glow.
- Approve = teal/green solid pill; reject/destructive = outlined danger pill, never solid red as a default state.
- Focus ring: 2px accent, offset 2px.

## Layout conventions
- RTL throughout (`dir="rtl"`), sidebar nav on the right in desktop shells, station identity fixed in header (never a picker) for role-scoped users.
- KPI stats as individual rounded cards in a grid, not table rows.
- Pending/unresolved states get a badge pill in accent; only the specific changed value/character is colored red in a diff.

See `Fuel Control System - Design Directions.dc.html` (options 2a–2i) for the reference screens.
