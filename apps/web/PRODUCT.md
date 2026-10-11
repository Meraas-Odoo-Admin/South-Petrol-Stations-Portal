# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three groups, weighted equally: each role's main screen must work first-class on its own device.

- **Petrol-station employees and supervisors** work at a pump, on a smartphone (installable PWA, portrait). The job: scan a vehicle's printed card with the phone camera, or type the plate for a vehicle without a card, enter the fill amount, record the fill-up. Supervisors also approve fill-up exceptions and see their stations' reports.
- **Registration employees and supervisors** work at a registration desk in a police station, on a desktop with a printer. The job: search the registry to avoid duplicates, register vehicles and owners, issue and print the card, request corrections. Supervisors approve corrections, replacement and cancelled cards, and manage their employees' accounts.
- **Directorate admins and system admins** work on a desktop. The job: manage stations, municipalities, security authorities, users, settings and exception types, and read reports and the audit log.

## Product Purpose

Fuel fill-up tracking and control for petrol stations under Sabha Security Directorate's oversight. Vehicles are registered at registration stations and receive a printed card with a QR code; petrol stations scan the card and record each fill-up. The system enforces per-municipality fill-up allowances and records violations and exceptions. Success is a fill-up recorded correctly in seconds at the pump, with every limit enforced and every action auditable.

## Positioning

Not a generic fleet or fuel-card product. It is a government-oversight system built around the registration-then-scan model: identity is created only at registration desks, and pumps can only read it. Rollout is one municipality at a time, starting with Sabha, with per-municipality allowances and launch stages (grace, awareness, card required).

## Operating Context

- UI language is Arabic, right-to-left. Bilingual support may come later, so layout must use logical properties.
- Pump staff use phones outdoors in direct sun and at night; scanning a printed plastic card under noon and night light is still to be tested by the client.
- Station connectivity is unreliable; slow or dropped connections are normal.
- Many users are not technical.
- Registration desks print cards and an A4 registration-stations sheet; kiosk printing on real hardware is still to be tested by the client.
- Phone testing over HTTPS is required (camera and QR scanning need a secure context); `pnpm dev:phone` provides a Cloudflare quick tunnel.

## Capabilities and Constraints

- Permissions are database-driven, never hardcoded to role names. Six roles: registration employee, registration supervisor, station employee, station supervisor, directorate admin, system admin.
- Station employees can never create or edit vehicle or owner data or print cards.
- Station-scoped access is enforced server-side; the UI only reflects it.
- Station numbers repeat across companies; a station is identified by company plus number, or by internal code. A vehicle is identified by internal code, not plate.
- Tunable numbers (weekly cap, minimum gap, stage dates) come from settings and municipality records, not constants.
- Privacy: no national IDs, administrative IDs or phone numbers in logs.
- Decided, not open: the six roles above are the final role list; a petrol station's security authority comes from its municipality (`Station.securityAuthorityId` is unused); fill-ups no longer record drivers.
- Still open with the client (`docs/REGISTRATION_PIVOT_PLAN.md` §13, `docs/OPEN_ITEMS.md` #55–#56). Do not firm these up:
  - which place names belong to Sabha municipality;
  - Sabha's awareness-start and deadline dates;
  - whether fill-up limits are the same or different per municipality;
  - lost-card replacement rules: supervisor approval, fee, police report;
  - permission to use the official emblem on the card;
  - whether the owner's name goes on the card (currently no, and no national ID either);
  - which documents an owner must bring to register, which decides whether the owner phone stays required.

## Brand Commitments

Binding, confirmed by the user: the app name **ضبط الوقود** ("Fuel Control"), tagline **منظومة ضبط تعبئة الوقود**, the existing logo and icon files in `public/brand/`, the teal and amber palette, and the Cairo typeface. Refinements build on these. The name deliberately avoids a police-rank connotation and does not bake in "Sabha"; every occurrence reads from `src/lib/appInfo.ts`.

## Evidence on Hand

- Real station rosters seeded from client documents (about 104 real stations plus 3 worked examples), 6 companies, seeded test accounts per role.
- Brand assets: `public/brand/` (symbol, favicon, app icons) and `public/manifest.webmanifest`.
- Existing screens and a component set under `src/components/design/`; screenshots in `docs/screenshots/`.
- No real usage metrics, user testimonials or field-test results exist yet; do not fabricate them.

## Product Principles

1. **The pump flow is sacred.** Scan, enter amount, confirm: as few steps as possible, readable in sun and at night, forgiving of bad connectivity.
2. **Every state is explicit.** Allowed, blocked, grace-period and exception outcomes are stated in plain Arabic, never left for the user to infer.
3. **Two buildings, one key.** Registration creates identity; pumps only read it. The interface must make that boundary obvious, never blur it.
4. **Plain words for non-technical users.** Short Arabic wording and few steps beat completeness on screen.
5. **Auditable by default.** Anything that changes data leaves a trace, and the interface never hides that from supervisors.

## Accessibility & Inclusion

- Arabic RTL first; use logical properties (`ps-*`/`pe-*`) so a bilingual UI needs no parallel stylesheet.
- High contrast and large touch targets for outdoor and night phone use.
- Clear loading, retry and offline-failure states.
- Language pitched for low digital literacy.
