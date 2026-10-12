---
name: ضبط الوقود (Fuel Control)
description: Arabic RTL control system for fuel fill-ups: warm paper, petrol-teal structure, one amber action.
colors:
  petrol-teal: "#0D5C52"
  petrol-teal-deep: "#0A4841"
  petrol-teal-tint: "#E3EFEC"
  gauge-amber: "#E8A53D"
  gauge-amber-deep: "#B97A1A"
  gauge-amber-tint: "#FBEDD4"
  violation-red: "#C1462D"
  violation-red-deep: "#8F3120"
  violation-red-tint: "#FBE6E0"
  approved-green: "#1F7A5C"
  approved-green-tint: "#E2F2EA"
  warm-paper: "#F7F5EF"
  surface-white: "#FFFFFF"
  mist-green: "#EEF2EE"
  ink: "#132524"
  ink-soft: "#5B6D6A"
  ink-faint: "#93A19E"
  hairline: "#E3E7E2"
typography:
  headline:
    fontFamily: "Cairo, sans-serif"
    fontSize: "20px"
    fontWeight: 800
  title:
    fontFamily: "Cairo, sans-serif"
    fontSize: "13px"
    fontWeight: 700
  body:
    fontFamily: "Cairo, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Cairo, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  data:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "28px"
    fontWeight: 800
  code:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    letterSpacing: "0.025em"
  page-title-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "24px"
    fontWeight: 800
  title-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "18px"
    fontWeight: 800
  lead-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "17px"
    fontWeight: 800
  body-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  body-secondary-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  caption-phone:
    fontFamily: "Cairo, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  title-desktop:
    fontFamily: "Cairo, sans-serif"
    fontSize: "15px"
    fontWeight: 800
  label-desktop:
    fontFamily: "Cairo, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.gauge-amber}"
    textColor: "{colors.surface-white}"
    typography: "{typography.title}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.mist-green}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 16px"
  button-ghost:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 16px"
  button-ghost-hover:
    backgroundColor: "{colors.mist-green}"
  button-danger:
    textColor: "{colors.violation-red}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 16px"
  button-danger-hover:
    backgroundColor: "{colors.violation-red-tint}"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "16px"
  kpi-card-neutral:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "16px"
  kpi-card-accent:
    backgroundColor: "{colors.gauge-amber-tint}"
    textColor: "{colors.gauge-amber-deep}"
    rounded: "{rounded.md}"
    padding: "16px"
  kpi-card-danger:
    backgroundColor: "{colors.violation-red-tint}"
    textColor: "{colors.violation-red-deep}"
    rounded: "{rounded.md}"
    padding: "16px"
  status-pill-ok:
    backgroundColor: "{colors.approved-green-tint}"
    textColor: "{colors.approved-green}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  status-pill-accent:
    backgroundColor: "{colors.gauge-amber-tint}"
    textColor: "{colors.gauge-amber-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  status-pill-neutral:
    backgroundColor: "{colors.mist-green}"
    textColor: "{colors.ink-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  status-pill-danger:
    textColor: "{colors.violation-red}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  input:
    backgroundColor: "{colors.mist-green}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "52px"
    padding: "0 14px"
  nav-item:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.full}"
    padding: "10px 14px"
  nav-item-active:
    backgroundColor: "{colors.petrol-teal}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.full}"
    padding: "10px 14px"
---

# Design System: ضبط الوقود (Fuel Control)

## Overview

**Creative North Star: "The Gauge Room"**

A calm instrument room for a control system. Warm paper is the floor, petrol teal is the structure and the brand, and a single amber needle marks the one thing to do next. Nothing performs. Every number, status and code sits where an operator expects to find it, and the same screen has to read at a pump in noon sun, at a police desk, and on a supervisor's monitor.

The system is Arabic and right-to-left first, with one typeface family and soft white cards that float on the paper rather than boxes drawn with rules. Color is a vocabulary with strict meanings: teal is structure and brand, amber is the call to action, green is approved, red is a rule that was broken or an action that cannot be undone. Because a screen is often read in direct sun, color never carries meaning alone. Every status also has a word or an icon.

The Directorate's real emblem is not part of this system. The product has its own symbol and name, and nothing in the interface imitates an official or state emblem.

**Key Characteristics:**
- Warm paper floor, white floating cards, petrol-teal structure.
- Amber is reserved for the single primary action on a screen.
- Red means a broken rule or an irreversible action, nothing else.
- Pill-shaped controls, 16px cards, 10px fields.
- Cairo for everything; JetBrains Mono only for literal codes and big numbers.
- Every status is a word or icon plus color, never color alone.

## Colors

A warm, low-saturation field with one deep teal and one amber, plus a status set with strict meanings.

### Primary
- **Petrol Teal** (#0D5C52): Brand and structure. The active navigation pill, the splash and theme color, headings of brand weight. Deep variant **Petrol Teal Deep** (#0A4841) for pressed states and brand text on tint. **Petrol Teal Tint** (#E3EFEC) for hover washes and quiet brand fills.

### Secondary
- **Gauge Amber** (#E8A53D): The call to action. The primary pill button (as an amber gradient with a soft amber glow), navigation badges, the focus ring. **Gauge Amber Deep** (#B97A1A) is its text-on-tint and gradient end. **Gauge Amber Tint** (#FBEDD4) fills pending and needs-your-decision states.

### Status
- **Violation Red** (#C1462D): A rule that was actually broken, and irreversible actions such as cancelling a card or deactivating an account. Deep variant **Violation Red Deep** (#8F3120) for text on tint; **Violation Red Tint** (#FBE6E0) for hover and alert fills. Routine states (inactive, empty, optional) never use red.
- **Approved Green** (#1F7A5C): Approved and successful states. **Approved Green Tint** (#E2F2EA) for its pill fill.

### Neutral
- **Warm Paper** (#F7F5EF): The page background. Warm, never pure white.
- **Surface White** (#FFFFFF): Cards, sheets, the sidebar and page headers.
- **Mist Green** (#EEF2EE): Input fields, secondary buttons, hover washes, quiet dividers.
- **Ink** (#132524): Primary text, a green-black rather than neutral black.
- **Ink Soft** (#5B6D6A): Secondary text, inactive navigation, ghost buttons.
- **Ink Faint** (#93A19E): Tertiary text, codes, captions.
- **Hairline** (#E3E7E2): Field borders and the rare unavoidable rule.

### Named Rules
**The Meaning-Fixed Rule.** Each hue carries one meaning: teal is structure and brand, amber is the next action, green is approved, red is broken or irreversible. Never borrow a hue for decoration.

**The One Needle Rule.** There is at most one amber primary action per screen region. If two things are amber, neither is the call to action.

**The Word-Beside-Color Rule.** Never rely on color alone. Every status pill, violation and approval carries its Arabic word or an icon, because the phone is read in direct sun.

## Typography

**Display Font:** Cairo (with sans-serif fallback). One face, Arabic and Latin, for headings and body alike.
**Body Font:** Cairo.
**Label/Mono Font:** JetBrains Mono, only for literal codes.

**Character:** Cairo gives Arabic and Latin one steady, round-shouldered voice at heavy weights. Mono appears only where a string is a literal system value, so a code never reads as a word.

### Hierarchy
- **Headline** (800, 20px): Page titles inside the white page header.
- **Title** (700, 13px): Card titles and the labels on primary actions.
- **Body** (400, 14px): Fields, paragraphs, table content.
- **Label** (500 to 700, 11px): Field captions, KPI labels, status pill text, subtitles.
- **Data** (JetBrains Mono, 800, 28px): KPI numbers, end-aligned, tabular.
- **Code** (JetBrains Mono, 400, 11px, letter-spacing 0.025em): Plates, internal codes, rule identifiers, setting keys, timestamps, in Ink Faint.

### Scale for screens built from Phase 4b onward

Phone and desktop have their own sizes, set per role. Older screens keep the ramp above and are not retrofitted yet.

| Role | Phone | Desktop |
|---|---|---|
| Page title | 24px / 800 | 20px / 800 |
| Card or sheet title | 18px / 800 | 15px / 800 |
| Job name, lead line | 17px / 800 | 15px / 800 |
| Body, field text, buttons | 16px | 14px |
| Secondary text, hints | 15px | 13px |
| Field label, small heading | 14px / 700 | 12px / 700 |
| Smallest allowed (captions, codes) | 13px | 12px |
| Key numbers (plate, liters, amount) | 24px or more | a step above body |

### Named Rules
**The Readable-in-Sun Rule.** On a phone nothing is set below 13px, body is 16px, and the figures a person must read at a glance (plate, liters, amount) are visibly larger than everything around them.

**The Code-Beside-Meaning Rule.** A literal code is never shown alone; its Arabic meaning sits next to it.

**The Isolated Numerals Rule.** Numbers use Western numerals with tabular figures, wrapped as left-to-right isolated runs inside the right-to-left flow.

## Layout

Right-to-left throughout. On desktop the sidebar (240px) sits on the right, the content to its start side, using logical properties so a bilingual UI needs no parallel stylesheet. Below the large breakpoint the sidebar disappears and navigation becomes its own designed mobile pattern: a collapsed top bar and a bottom bar of the four most-used destinations, with a sheet dropping from the top for everything else.

Content sits on Warm Paper. Pages open with a white header strip (title and subtitle on one side, filters and the primary action on the other), then stacks of white cards. KPI figures are individual rounded cards in a grid, never table rows. A user scoped to a station sees the station fixed in the header, never as a picker. Spacing follows the Tailwind scale; the recurring rhythm is 16px inside cards, 18px by 14px in card headers, and 24px by 20px in page headers.

## Elevation & Depth

Layered and ambient. White surfaces float on warm paper on soft, low-opacity shadows tinted with the ink color, and structure comes from radius and shadow rather than drawn rules. Shadows are quiet at rest and stronger only for overlays.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 2px rgba(19,37,36,.06), 0 1px 1px rgba(19,37,36,.04)`): Cards, page headers, the active navigation pill.
- **Raised** (`box-shadow: 0 8px 24px -8px rgba(19,37,36,.18)`): Menus and popovers.
- **Overlay** (`box-shadow: 0 20px 48px -12px rgba(19,37,36,.28)`): Dialogs and sheets.
- **Action Glow** (`box-shadow: 0 4px 16px -2px rgba(232,165,61,.45)`): The primary amber button only.

### Named Rules
**The Float-Don't-Draw Rule.** Separate regions with radius, shadow and background change. Do not stack divider lines to make structure.

## Shapes

Soft and rounded, never sharp. Three corner sizes: 10px for fields and chips, 16px for cards and KPI tiles, 24px for sheets and dialogs. Anything you press or select as a control, such as buttons, status pills and navigation items, is a full pill. Borders are rare: a Hairline border on inputs, and an outlined pill for danger and destructive actions.

## Components

### Buttons
- **Shape:** Full pill (9999px). Medium is 36px tall, small is 32px.
- **Primary:** Amber gradient fill (Gauge Amber to Gauge Amber Deep) with white bold text and the Action Glow shadow. One per region.
- **Secondary:** Mist Green fill, Ink Soft text.
- **Ghost:** No fill, Ink Soft text; Mist Green wash on hover.
- **Danger:** Outlined Violation Red pill with red text; Violation Red Tint on hover. Never solid red as a default state. Reserved for broken-rule responses and irreversible actions.
- **Disabled:** 40% opacity.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Surface White on Warm Paper.
- **Shadow Strategy:** Rest shadow, no border.
- **Header:** Optional header row with a bold 13px title, faint subtitle and an action at the far side, separated by a Mist Green rule.
- **Internal Padding:** 16px; headers 18px by 14px.

### KPI Cards
Individual rounded cards: an 11px label on top and a 28px mono figure end-aligned below. Neutral on white; accent on Gauge Amber Tint for the figure that needs a decision; danger on Violation Red Tint for a rate that is actually a problem.

### Status Pills
- **Shape:** Full pill, 11px bold text, 2px by 10px padding.
- **Ok:** Approved Green on its tint. **Accent:** Gauge Amber Deep on its tint, for pending states. **Neutral:** Ink Soft on Mist Green, for inactive or empty. **Danger:** outlined Violation Red, reserved for broken rules.
- Every pill carries a word.

### Inputs / Fields
- **Style:** Mist Green fill, 1px Hairline border, 10px radius, 52px tall, 14px Ink text.
- **Focus:** A 2px Gauge Amber ring with no default outline.
- **Label and hint:** the label sits above the field and is tied to it (never placeholder-only). A hint is one plain sentence under the field.
- **Error:** a refusal or a broken rule shows as a Violation Red border, plus a warning icon and a sentence under the field that says what to do, announced to screen readers. Never the border alone. Nothing is wiped; the person's typing stays.
- **Disabled:** a faded Mist Green field with Ink Faint text and a not-allowed cursor, and always a lock icon with one sentence under it saying why (for example, the username cannot change after creation). A disabled field is never a silent dead end.
- **Built as:** the shared TextField, with a TextAreaField for longer text.

### Navigation
- **Style:** Full-pill items, 12.5px bold text, an icon at the start and an optional badge at the end.
- **States:** Ink Soft at rest, Mist Green wash on hover, Petrol Teal fill with white text and Rest shadow when active. Badges are small Gauge Amber pills with white figures.
- **Mobile:** Collapsed top bar plus a bottom bar of four destinations; a top-dropping sheet carries the rest.

### Inline Notices
A short message tied to what was just done, always an icon plus words: success on Approved Green Tint, a refusal or failure on Violation Red Tint, a pending state on Gauge Amber Tint, plain information on Mist Green. Success is announced politely; a problem interrupts.

### Dialogs
A sheet that rises from the bottom edge on a phone and a centred 24px-radius panel on a desktop. Escape and the backdrop close it, focus moves in and returns, and it cannot be closed while a request is running. A destructive confirmation names the person and what will happen, asks for a reason when one is required, and puts the outlined red action last.

### Place Picker
A searchable list with the chosen places as removable chips above it and a count in words. Rows are 56px on a phone. Never a wall of checkboxes.

### Job Picker
One job from a short list grouped by side, as large radio cards each carrying one plain sentence.

### One-Time Password Panel
The temporary password in large left-to-right mono on white inside an amber-tinted panel, a copy button, and a plain warning that it is shown once and cannot be recovered.

### Plate and Code Displays
Plates, internal codes and rule identifiers render as left-to-right isolated runs in JetBrains Mono. An unregistered vehicle shows its typed plate with a Gauge Amber Tint badge reading "مركبة غير مسجلة".

### Charts and Report Figures (phase 4c)
Report charts use two colours with fixed meanings: teal `#0D5C52` for a fill-up with a card (and for cards issued), deep amber `#B97A1A` for one without. The pair passes the colour-vision and contrast checks; teal sits below the validator's lightness band because it is the brand colour. Amber is "needs attention", not "wrong", so red is never used for «no card». A chart always carries a legend in words with a direct total for each series, 2px surface gaps between stacked segments, a 4px rounded data end, bars from zero, a hover tooltip, grid and axis text in the ink and hairline tokens (axis text 13px), and a «عرض الأرقام في جدول» table view. Key figures on a report are 28px. A reconciliation or estimate verdict is a pill or sentence that names the state in words with a mark (✓, ⚠, ✕) and the number: «بطاقات غير مبرَّرة: 15» is red, a likely counting error is amber, a zero difference is green. Wide comparison tables become one card per item on a phone, with the same rows.

### Motion
Short, quiet entrance and feedback animations only: fade-in-up (380ms, 6px rise) for card grids and rows, fade-in (300ms), scale-in (200ms), and a soft pulse (1.6s) for loading. Component state changes use the default Tailwind transition. Hover is tint-only: a background wash or a brightness change, never a lift or an added shadow.

## Do's and Don'ts

### Do:
- **Do** keep every hue to its meaning: teal for structure and brand, amber for the next action, green for approved, red for broken rules and irreversible actions.
- **Do** pair every status with a word or an icon, never color alone.
- **Do** keep one amber primary action per screen region.
- **Do** use Cairo for all text and JetBrains Mono only for literal codes, plates, timestamps and big numbers.
- **Do** put a code next to its Arabic meaning, and wrap numerals as left-to-right isolated runs.
- **Do** use Tailwind logical properties (`ps-*`, `pe-*`, `ms-*`, `me-*`) so a bilingual UI needs no parallel stylesheet.
- **Do** use the 2px Gauge Amber focus ring with a 2px offset on every interactive element.
- **Do** style irreversible actions (cancel a card, deactivate an account) as outlined Violation Red pills so they look as serious as they are.
- **Do** say why a control is disabled and what to do after a refusal, in a sentence beside it; never leave a faded field or a bare error colour unexplained.
- **Do** set the one-time password in large left-to-right type with a copy button and a plain warning that it is shown once.

### Don't:
- **Don't** make the interface read as military or police: no badges, camouflage or uniform-style visuals.
- **Don't** use or imitate the Directorate's official emblem or any state emblem.
- **Don't** use red for routine states such as inactive, empty or optional, and never as a solid fill by default.
- **Don't** introduce a second typeface.
- **Don't** convey a status by color alone.
- **Don't** put two amber primary actions in the same region.
