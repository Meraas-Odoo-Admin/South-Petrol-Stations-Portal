# Project instructions for Claude Code

Fuel fill-up tracking system for stations under Sabha Security Directorate's oversight. Stack: NestJS, PostgreSQL (Prisma), React + Vite, Tailwind CSS. Full context and phased roadmap: `docs/IMPLEMENTATION_PLAN.md` — read it before starting any phase. Open client questions still pending: `docs/OPEN_ITEMS.md`.

## Non-negotiable rules

1. **Never key a station by `stationNumber` alone.** Station numbers repeat across companies by design (confirmed by the client). Always use `(companyId, stationNumber)` together, or `internalCode`. Same logic for `Vehicle`: use `internalCode`, not `currentPlate`, as the durable identifier — plates change over time.

2. **No hardcoded role checks.** Every protected endpoint uses `@RequirePermission('resource:action')` + `PermissionsGuard`. Roles and permissions are database rows (`Role`, `Permission`, `RolePermission`), never `if (user.role === 'x')` in application code. If a feature seems to need a new role or permission, add rows via the seed/admin UI — don't branch on role names in code.

3. **Station-scoped access is enforced server-side, in the service/repository layer** — not just hidden in the UI. A user with `UserStationScope` rows can only query data for those stations, enforced by intersecting every fill-up/driver/vehicle query with their scope. Write an e2e test for this before considering any station-data endpoint done.

4. **Tunable business numbers come from `SystemSetting`, not constants.** Weekly fill-up cap, minimum gap in days, week-start convention — all read at request time from the `system_settings` table. Never hardcode `3` or `2` in the rule engine.

5. **Exception categories and security authorities are lookup tables (`ExceptionType`, `SecurityAuthority`), not enums.** New categories are data, added without a deploy.

6. **Every mutating endpoint writes an `AuditLog` row.** The audit table is insert-only for the app's DB role — never grant it `UPDATE`/`DELETE`.

7. **Every DTO uses `class-validator`, and the global `ValidationPipe` runs with `whitelist: true, forbidNonWhitelisted: true, transform: true`.** No endpoint accepts an unvalidated body.

8. **No raw SQL string concatenation, ever.** Prisma's generated client or parameterized `$queryRaw` only.

9. **Passwords: Argon2id.** Refresh tokens: stored hashed, httpOnly+Secure+SameSite cookie, rotated on use, revocable via the `RefreshToken` table.

10. **Never log national IDs, administrative IDs, or phone numbers.** Log entity IDs, not PII.

## Working style

- One roadmap phase (see `docs/IMPLEMENTATION_PLAN.md` §11) per session/branch. Don't jump ahead to a later phase while an earlier phase's "done means" checklist is still red.
- Write the rule engine (`FillUpRuleEngine`) as pure, independently unit-tested logic before wiring it into any controller.
- Prefer additive Prisma migrations (new nullable column/table) over destructive ones. Run `prisma migrate dev` locally and commit the migration files — never hand-edit the database directly.
- UI is RTL Arabic. Use Tailwind logical properties (`ps-*`/`pe-*`, not `pl-*`/`pr-*`) so a future bilingual UI doesn't require a parallel stylesheet.
- Some fields (e.g., `Station.securityAuthorityId`, exact role list, driver phone requirement) are placeholders pending client answers — they're deliberately nullable/flexible. Don't "clean them up" by making assumptions firm; check `docs/OPEN_ITEMS.md` first.

## Before marking any phase done

Run the phase's "done means" checklist from `docs/IMPLEMENTATION_PLAN.md` §11 yourself and confirm it — don't take a self-report at face value. At minimum: lint + typecheck + test suite green, and for any phase touching fill-ups or user data, the station-scoping boundary test passes.
