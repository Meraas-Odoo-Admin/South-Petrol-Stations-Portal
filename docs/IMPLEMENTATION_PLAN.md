# Fuel Tracking System — Implementation Plan & Security Architecture

**Project:** Fuel fill-up tracking system for fuel stations under Sabha Security Directorate's oversight
**Stack:** NestJS · PostgreSQL · React · Tailwind CSS
**Author of this plan:** drafted 22 Aug 2026, based on confirmed business rules and the client's answers so far
**Status:** Several data points are still pending from the client (see §13). This plan is deliberately structured so implementation starts now without those answers, and slots them in later without a rewrite.

---

## 0. What this document is for

This is the engineering blueprint you hand to Claude Code, phase by phase. It captures every decision that's already been made (business rules, data model, security posture) so Claude Code isn't guessing, and it flags every decision that's *not* made yet so it doesn't accidentally hardcode something that will change. Read §3 first — it's the single idea that makes the rest of this plan work.

---

## 1. Tech stack decisions & rationale

| Layer | Choice | Why |
|---|---|---|
| API framework | NestJS (TypeScript) | Opinionated module structure, built-in DI, guards/interceptors map cleanly onto RBAC and audit logging requirements. |
| Database | PostgreSQL 16 | Strong constraint support (composite unique keys, check constraints, row-level security if needed later), JSONB for audit diffs, mature and well-understood for a government-adjacent system. |
| ORM | **Prisma** (recommended) | Schema-as-code, safe generated migrations, full type safety end-to-end. TypeORM is a valid alternative if you prefer decorator-based entities — the schema in §4 works with either, but the code samples in this plan assume Prisma. |
| Frontend | React + Vite + TypeScript | Fast dev loop, no framework lock-in beyond React itself. |
| Styling | Tailwind CSS | Utility-first, pairs well with RTL Arabic UI (logical properties, `rtl:` variants). |
| Server state | TanStack Query (React Query) | Caching, retries, and background refetch — matters a lot given some stations may have unstable internet. |
| Forms/validation | React Hook Form + Zod (frontend), class-validator (backend) | Two layers of validation is intentional — never trust the client. |
| Auth | Passport + JWT (access + refresh) | Standard, well-audited, works offline-tolerant with short-lived access tokens. |
| Monorepo tooling | pnpm workspaces | Simple, fast, no need for Turborepo at this project's scale — add it later only if build times become a problem. |

---

## 2. Monorepo structure

```
fuel-tracking-system/
├── apps/
│   ├── api/                    # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── rbac/           # roles, permissions, guards
│   │   │   │   ├── companies/
│   │   │   │   ├── stations/
│   │   │   │   ├── drivers/
│   │   │   │   ├── vehicles/
│   │   │   │   ├── fillups/        # the rule engine lives here
│   │   │   │   ├── exceptions/
│   │   │   │   ├── reports/
│   │   │   │   ├── audit/
│   │   │   │   └── system-settings/
│   │   │   ├── common/
│   │   │   │   ├── guards/
│   │   │   │   ├── decorators/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── filters/
│   │   │   │   └── pipes/
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── test/
│   └── web/                    # React frontend
│       ├── src/
│       │   ├── features/           # mirrors backend modules
│       │   ├── components/
│       │   ├── lib/
│       │   └── App.tsx
│       └── vite.config.ts
├── packages/
│   └── shared-types/           # DTOs/enums shared between api and web
├── infra/
│   ├── docker-compose.yml      # local Postgres + adminer
│   └── nginx/                  # reverse proxy config for prod
├── docs/
│   ├── IMPLEMENTATION_PLAN.md  # this file
│   ├── OPEN_ITEMS.md           # living copy of §13, update as client answers arrive
│   └── erd.md
├── .github/workflows/ci.yml
├── CLAUDE.md
└── pnpm-workspace.yaml
```

Why a monorepo: the `shared-types` package means a DTO shape only has to change in one place, and the frontend gets a compile error immediately if it drifts from what the API actually returns. That alone prevents a whole category of "edit broke something downstream" bugs.

---

## 3. The core extensibility principle — read this before writing any schema

Every open question from the client (§13) is really the same risk wearing different clothes: **we don't yet know the final shape of some business rule.** The fix isn't to wait — it's to make the *unknown* parts of the system configuration and data, not code and schema. Concretely, four decisions run through this entire plan:

1. **Station identity is a composite key, never a bare number.** The client confirmed station numbers repeat across companies by design. Every table, query, and UI list must key on `(company_id, station_number)` together, never `station_number` alone. This is enforced with a real database constraint (§4), not just application logic — see it below.
2. **Roles and permissions are rows, not code.** Instead of `if (user.role === 'supervisor')` scattered through the codebase, every protected action checks a named permission (`fillups:approve_exception`) that's granted to roles via a join table. Adding a new role, or changing what a role can do, becomes a data change an admin can make — not a deploy.
3. **Tunable business numbers live in a settings table, not a constant.** The weekly fill-up cap, the gap-in-days rule, and whether the week is rolling or fixed-start are all read from `system_settings` at request time. When the client confirms the week-start-day question, you change a row, not code.
4. **Anything the client described as "can change over time" gets its own table with a timestamp, not a fixed column.** Fuel type availability per station and vehicle plate numbers are both like this — see §4.

Keep this list taped to the monitor. Every time a new client answer comes in, the question to ask is "does this go in `system_settings` / a lookup table, or does it actually change the schema?" — usually it's the former.

---

## 4. Database schema (core entities)

This is written as annotated Prisma models. Field lists are deliberately complete enough to start from, but treat anything marked `// TBD` as a placeholder pending client answers — don't let it block starting.

```prisma
// ── Companies & Stations ─────────────────────────────────────────────

model Company {
  id        String    @id @default(cuid())
  name      String    @unique
  isActive  Boolean   @default(true)
  stations  Station[]
  createdAt DateTime  @default(now())
}

model Station {
  id             String   @id @default(cuid())
  internalCode   String   @unique              // e.g. STN-0001 — the ONLY globally unique station identifier
  stationNumber  String                         // as reported by the company — NOT globally unique
  name           String
  companyId      String
  company        Company  @relation(fields: [companyId], references: [id])
  municipality   String?
  status         StationStatus @default(ACTIVE)
  securityAuthorityId String?  // TBD — see §13, item 4. Nullable until scope question is answered.
  securityAuthority   SecurityAuthority? @relation(fields: [securityAuthorityId], references: [id])
  fuelAvailability    StationFuelAvailability[]
  fillUps             FillUpTransaction[]
  userScopes          UserStationScope[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([companyId, stationNumber])  // <-- the composite key that encodes the lesson learned
}

enum StationStatus {
  ACTIVE
  SUSPENDED_LEGAL       // موقوفة قضائيًا
  SUSPENDED_COMMITTEE   // موقوفة (لجنة)
  SUSPENDED_OWNER       // معلّقة - خاصة
  NOT_YET_SUPPLIED      // لم تُزوَّد بعد
  UNVERIFIED            // غير مؤكد — from the handwritten list, needs manual review
}

// Fuel availability is TIME-VARYING per the client — never a fixed column on Station.
model StationFuelAvailability {
  id          String   @id @default(cuid())
  stationId   String
  station     Station  @relation(fields: [stationId], references: [id])
  fuelType    FuelType
  isAvailable Boolean  @default(true)
  updatedBy   String?  // userId
  updatedAt   DateTime @updatedAt

  @@unique([stationId, fuelType])
}

enum FuelType {
  PETROL_95
  DIESEL
  KEROSENE   // currently unused per client, but the enum stays open for the future
}

// Placeholder for the لجنة إعادة تنظيم المدن scope question — safe to leave empty until answered.
model SecurityAuthority {
  id       String    @id @default(cuid())
  name     String    @unique   // "مديرية أمن سبها", "الحرس البلدي", "الجمارك", ...
  stations Station[]
}

// ── RBAC ──────────────────────────────────────────────────────────────

model Role {
  id          String           @id @default(cuid())
  name        String           @unique   // "station_employee", "station_supervisor", "directorate_admin", "system_admin"
  description String?
  permissions RolePermission[]
  users       UserRole[]
}

model Permission {
  id          String           @id @default(cuid())
  key         String           @unique   // "fillups:create", "fillups:approve_exception", "reports:view_all_stations"
  description String?
  roles       RolePermission[]
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}

model User {
  id           String     @id @default(cuid())
  username     String     @unique
  passwordHash String
  fullName     String
  phone        String?
  isActive     Boolean    @default(true)
  roles        UserRole[]
  stationScope UserStationScope[]   // empty = directorate-wide access; non-empty = scoped to listed stations
  recordedFillUps FillUpTransaction[] @relation("RecordedBy")
  refreshTokens RefreshToken[]
  createdAt    DateTime   @default(now())
}

model UserRole {
  userId String
  roleId String
  user   User @relation(fields: [userId], references: [id])
  role   Role @relation(fields: [roleId], references: [id])

  @@id([userId, roleId])
}

// Station-scoped access — a station employee is restricted to their station(s) at the QUERY level, not just the UI.
model UserStationScope {
  userId    String
  stationId String
  user      User    @relation(fields: [userId], references: [id])
  station   Station @relation(fields: [stationId], references: [id])

  @@id([userId, stationId])
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   // never store the raw token
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
}

// ── Drivers, Owners, Vehicles ────────────────────────────────────────

enum IdentityType {
  NATIONAL_ID
  ADMINISTRATIVE_ID   // بديل معتمد لدى الطوارق وقبائل أخرى — equally valid per client confirmation
}

model Driver {
  id             String   @id @default(cuid())
  identityType   IdentityType
  identityNumber String
  fullName       String
  phone          String?  // TBD confirm still required — see §13
  vehicles       DriverVehicle[]
  fillUps        FillUpTransaction[]
  createdAt      DateTime @default(now())

  @@unique([identityType, identityNumber])
}

model VehicleOwner {
  id        String    @id @default(cuid())
  fullName  String
  nationalId String?
  phone     String?
  address   String?
  vehicles  Vehicle[]
}

model Vehicle {
  id             String   @id @default(cuid())
  internalCode   String   @unique          // fixed forever, even if the plate changes
  currentPlate   String   @unique
  chassisNumber  String?  @unique
  vehicleType    String?
  model          String?
  color          String?
  manufactureYear Int?
  usageType      VehicleUsageType?
  ownerId        String?
  owner          VehicleOwner? @relation(fields: [ownerId], references: [id])
  plateHistory   VehiclePlateHistory[]
  drivers        DriverVehicle[]
  fillUps        FillUpTransaction[]
  createdAt      DateTime @default(now())
}

enum VehicleUsageType {
  GOVERNMENT
  PRIVATE
  COMMERCIAL
}

// Plates change (sale, re-registration, damage) — never lose fill-up history when that happens.
model VehiclePlateHistory {
  id        String   @id @default(cuid())
  vehicleId String
  vehicle   Vehicle  @relation(fields: [vehicleId], references: [id])
  plate     String
  validFrom DateTime @default(now())
  validTo   DateTime?
}

model DriverVehicle {
  driverId  String
  vehicleId String
  isPrimary Boolean @default(false)
  driver    Driver  @relation(fields: [driverId], references: [id])
  vehicle   Vehicle @relation(fields: [vehicleId], references: [id])

  @@id([driverId, vehicleId])
}

// ── Fill-ups & Exceptions ────────────────────────────────────────────

model FillUpTransaction {
  id             String   @id @default(cuid())
  vehicleId      String
  vehicle        Vehicle  @relation(fields: [vehicleId], references: [id])
  driverId       String
  driver         Driver   @relation(fields: [driverId], references: [id])
  stationId      String
  station        Station  @relation(fields: [stationId], references: [id])
  fuelType       FuelType
  quantityLiters Decimal
  occurredAt     DateTime @default(now())
  recordedById   String
  recordedBy     User     @relation("RecordedBy", fields: [recordedById], references: [id])
  isException    Boolean  @default(false)
  exception      Exception?
  createdAt      DateTime @default(now())

  @@index([vehicleId, occurredAt])   // the rule engine's hottest query path
  @@index([driverId, occurredAt])
  @@index([stationId, occurredAt])
}

// Lookup table, not an enum — the client already surfaced two new exception categories
// after the first questionnaire round. New categories must never require a code change.
model ExceptionType {
  id           String   @id @default(cuid())
  key          String   @unique   // "medical_chronic", "transit_traveler", "government", "emergency"
  name         String
  requiresProof Boolean @default(true)
  isActive     Boolean  @default(true)
  exceptions   Exception[]
}

model Exception {
  id                   String   @id @default(cuid())
  fillUpTransactionId  String   @unique
  fillUpTransaction    FillUpTransaction @relation(fields: [fillUpTransactionId], references: [id])
  exceptionTypeId      String
  exceptionType        ExceptionType @relation(fields: [exceptionTypeId], references: [id])
  reason               String
  approvedById         String
  proofReference       String?
  validUntil           DateTime?   // null = one-off; set = recurring exception with an expiry
  createdAt            DateTime @default(now())
}

// ── Tunable business rules — the whole point of §3 ───────────────────

model SystemSetting {
  key         String   @id     // "fillup.max_per_week", "fillup.min_gap_days", "fillup.week_start_day"
  value       String           // stored as string, parsed by the consuming service
  description String?
  updatedAt   DateTime @updatedAt
}

// ── Audit ─────────────────────────────────────────────────────────────

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  action     String            // "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "APPROVE_EXCEPTION" ...
  entityType String
  entityId   String
  oldValue   Json?
  newValue   Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([userId, createdAt])
}
```

A few things worth calling out explicitly:

- **`@@unique([companyId, stationNumber])`** on `Station` is a database-level guarantee, not just a convention — it makes it structurally impossible to accidentally insert the same company's station twice, while still allowing `408` to exist under two different companies.
- **`AuditLog` should be append-only at the database level.** The application's Postgres role should have `INSERT` but not `UPDATE`/`DELETE` on this table. Migrations run under a separate, more privileged role (see §8).
- **`internalCode` on `Station` and `Vehicle`** are the actual primary identifiers used everywhere in the UI and in reports — `stationNumber` and `currentPlate` are display/lookup fields, not identity.

---

## 5. RBAC & permissions design

Don't hardcode role checks. The pattern:

```typescript
// common/decorators/require-permission.decorator.ts
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata('permissions', permissions);

// common/guards/permissions.guard.ts
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private rbac: RbacService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string[]>('permissions', ctx.getHandler());
    // No @RequirePermission and no @Public marker on this route = fail
    // closed. A route that forgot to declare either must not silently
    // become public.
    if (!required) throw new ForbiddenException();
    const { user } = ctx.switchToHttp().getRequest();
    if (!(await this.rbac.isUserActive(user.id))) throw new UnauthorizedException();
    const userPermissions = await this.rbac.getPermissionsForUser(user.id); // cached
    return required.every(p => userPermissions.has(p));
  }
}

// usage in a controller
@RequirePermission('fillups:approve_exception')
@Post('exceptions/:id/approve')
approveException(@Param('id') id: string) { ... }
```

Seed four starting roles (matching what's already been discussed with the client, pending their confirmation of the exact list in §13):

| Role | Example permissions |
|---|---|
| `station_employee` | `fillups:create` |
| `station_supervisor` | `fillups:create`, `fillups:update`, `fillups:approve_exception` |
| `directorate_admin` | `reports:view_all_stations` |
| `system_admin` | all permissions, `users:manage`, `roles:manage` |

**Station scoping is enforced in the service layer, not the controller.** Every repository method that lists or reads fill-ups must intersect the query with the caller's `UserStationScope`. **"Sees every station" is an explicit, admin-managed flag — `Role.unrestrictedStationAccess` — never inferred from an empty scope list.** A scoped role (`station_employee`, `station_supervisor`) with zero `UserStationScope` rows must see *nothing*, not everything: an employee who hasn't been assigned a station yet, or who just had their last one removed, is not the same thing as a directorate-wide role. Only roles with `unrestrictedStationAccess: true` (`directorate_admin`, `system_admin`) bypass the scope check entirely; every other role gets the exact (possibly empty) list of station IDs from `UserStationScope`. This is the difference between "the UI hides other stations" and "a station employee literally cannot fetch another station's data even by guessing an ID" (an IDOR fix, not a UX nicety) — and it's also the fix for a real bug caught in review: treating an empty scope list as "unrestricted" instead of "access to nothing" briefly shipped in M1 before being caught and corrected.

**Known gap, flagged for whichever phase builds user deactivation (not yet scoped — add it to that phase's task list when it is):** `RbacService` caches `isActive` under the same 30-second TTL as permissions (`CACHE_TTL_MS` in `rbac.service.ts`). Role removal and station-scope removal already call `rbac.invalidate(userId)` right after the DB write, so those take effect on the very next request. There is no deactivate-user endpoint anywhere in the codebase yet — when one is built, it **must** call `rbac.invalidate(userId)` immediately after setting `isActive: false`, or a deactivated user's still-valid access token keeps authorizing requests for up to 30 seconds instead of failing on their next request.

---

## 6. Fill-up rule engine design

Keep this as a pure, independently unit-tested service — it's the single most important piece of business logic in the system and the one most likely to have its parameters change as the client's answers come in.

```typescript
@Injectable()
export class FillUpRuleEngine {
  constructor(private settings: SystemSettingsService, private repo: FillUpRepository) {}

  async evaluate(vehicleId: string, occurredAt: Date): Promise<RuleResult> {
    const maxPerWeek = await this.settings.getNumber('fillup.max_per_week');   // default 3
    const minGapDays = await this.settings.getNumber('fillup.min_gap_days');   // default 2

    const recent = await this.repo.getRecentFillUps(vehicleId, occurredAt, /* lookback */ 14);

    const lastFillUp = recent[0];
    if (lastFillUp && daysBetween(lastFillUp.occurredAt, occurredAt) < minGapDays) {
      return { allowed: false, reason: 'GAP_TOO_SHORT' };
    }

    const countThisWeek = countInWindow(recent, occurredAt, await this.settings.getWeekWindow());
    if (countThisWeek >= maxPerWeek) {
      return { allowed: false, reason: 'WEEKLY_CAP_REACHED' };
    }

    return { allowed: true };
  }
}
```

When a fill-up is rejected, the API returns the reason to the frontend, which offers a supervisor the "request exception" flow rather than silently blocking — matching the client's confirmed rule (no hard block, exception with a mandatory reason).

`getWeekWindow()` is intentionally abstracted — it's the one function that changes shape depending on whether the client confirms a fixed week-start-day or a rolling 7-day window (§13). Write both implementations behind the same interface now if you want to be ready either way; it's a small function.

**Aggregate per-driver cap, and its interaction with the per-vehicle cap, is PROVISIONAL.** `docs/OPEN_ITEMS.md`'s resolved section confirms the client wants both a per-vehicle cap and an aggregate per-driver cap, but flags the mechanism as "implementation detail still to be finalized." M3 implements `FillUpRuleEngine.evaluate(vehicleId, driverId, occurredAt)` as four independent checks — vehicle gap, vehicle weekly cap, driver gap, driver weekly cap, in that order, first failure wins (`VEHICLE_GAP_TOO_SHORT` / `VEHICLE_WEEKLY_CAP_REACHED` / `DRIVER_GAP_TOO_SHORT` / `DRIVER_WEEKLY_CAP_REACHED`) — with the driver-level `SystemSetting` numbers (`fillup.max_per_week_per_driver`, `fillup.min_gap_days_per_driver`) seeded as placeholders at the same values as the vehicle-level ones. Neither the check order nor the fact that the two caps are independent (rather than combined into one number, or evaluated some other way) is client-confirmed — treat both as placeholders pending the final answer, not as a settled design.

---

## 7. API design conventions

- REST, versioned from day one: `/api/v1/...` — a government client will likely ask for integrations eventually, and versioning cost nothing to add now versus a lot to retrofit.
- Every endpoint has a DTO with `class-validator` decorators. Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Consistent error shape: `{ statusCode, error, message, correlationId }`. Never leak stack traces in production (global exception filter).
- Swagger/OpenAPI auto-generated from DTOs (`@nestjs/swagger`) — free API documentation, and it doubles as a contract check against `shared-types`.
- Pagination: cursor or offset+limit consistently, never return unbounded lists (reports on 100 stations × thousands of fill-ups/day will get large fast).
- Idempotency key on the fill-up creation endpoint — a flaky station connection retrying a POST should never double-record a fill-up.

---

## 8. Security architecture

This is a system tracking government-adjacent security data (national IDs, vehicle movements) — treat it accordingly, not as a generic CRUD app.

**Authentication**
- Argon2id password hashing (not bcrypt — Argon2id is the current OWASP recommendation).
- JWT access token, short-lived (10–15 min); refresh token stored as an httpOnly, Secure, SameSite=Strict cookie, rotated on every use, and its hash (not the raw token) stored in `RefreshToken` so it's revocable.
- Account lockout after N failed attempts (store attempt count + lockout expiry on `User`, or use a Redis-backed limiter if you add Redis later).
- Admin-created accounts force a password change on first login.

**Authorization**
- Permission-based guards on every controller (§5) — no endpoint without an explicit `@RequirePermission` or an explicit `@Public()` marker, enforced by a lint rule or a startup check that fails loudly if a route has neither.
- Station scoping enforced at the repository/service layer (§5), not just in the controller or the UI.

**Input handling**
- `class-validator` DTOs everywhere, `whitelist + forbidNonWhitelisted`.
- Prisma's parameterized queries only — no raw SQL string interpolation. If raw SQL is ever unavoidable, use Prisma's tagged-template `$queryRaw` (parameterized) and flag it in code review.

**Transport & headers**
- TLS everywhere (terminate at nginx/reverse proxy, HSTS enabled).
- `helmet()` in Nest's bootstrap.
- CORS: explicit origin allowlist, never `*`, especially since credentials (cookies) are involved.
- CSP header restricting script/style sources.

**Rate limiting**
- `@nestjs/throttler` globally, with a tighter limit specifically on `/auth/login` and `/auth/refresh`.

**Secrets & configuration**
- `.env` never committed; `.env.example` documents required vars.
- Separate `.env` per environment (dev/staging/prod), and separate DB credentials per environment.
- If deploying to a VPS the directorate controls, still avoid storing plaintext secrets in the repo or in shell history — use a secrets file with restricted permissions at minimum, a proper secrets manager if the hosting allows it.

**Data protection**
- National ID / administrative ID are sensitive — mask them in the UI for roles that don't need the full value (e.g., show last 4 digits to a station employee, full value only to supervisor+).
- Never log PII (national IDs, phone numbers) in application logs — scrub before logging, or log entity IDs only.
- `AuditLog` table: application DB role has `INSERT` only, no `UPDATE`/`DELETE` — migrations run under a separate elevated role. This makes the audit trail meaningfully tamper-resistant against a compromised application account, not just "there in principle."

**Database hardening**
- Least-privilege DB role for the running app (no `DROP`, no `CREATE`, no access to other schemas).
- Migrations run in CI/CD under a separate, more privileged role — never by the app at boot.
- Automated encrypted backups with a tested restore procedure (test this before go-live, not after an incident).

**Dependency & code hygiene**
- `npm audit` / Dependabot or Renovate wired into CI.
- ESLint + TypeScript `strict: true`.
- Husky pre-commit: lint + typecheck + unit tests for the rule engine.
- Unit tests specifically covering RBAC boundaries: e.g., an e2e test asserting a `station_employee` scoped to Station A gets a 403/empty result querying Station B's fill-ups — this is the test most likely to catch a real security regression, write it early and keep it in CI forever.

**OWASP Top 10 — quick mapping**

| Risk | Mitigation already in this plan |
|---|---|
| Broken access control | Permission guards + station-scoped queries + the explicit e2e boundary test above |
| Cryptographic failures | Argon2id, TLS everywhere, no PII in logs |
| Injection | ORM-only parameterized queries, DTO validation |
| Insecure design | Rule engine as testable pure logic, RBAC as data not code |
| Security misconfiguration | helmet, explicit CORS allowlist, strict env separation |
| Vulnerable components | Automated dependency scanning in CI |
| Auth failures | Argon2id, lockout, short-lived tokens, rotated refresh tokens |
| Data integrity failures | Append-only audit log, DB constraints (composite unique keys) |
| Logging/monitoring failures | Structured audit log + correlation IDs on every error response |
| SSRF | Not applicable yet — revisit if the system ever calls external APIs |

---

## 9. Frontend architecture

- React + Vite + TypeScript, Tailwind CSS.
- `dir="rtl"` set at the document root; use Tailwind's logical properties (`ps-4`/`pe-4` instead of `pl-4`/`pr-4`) so the layout doesn't need a parallel LTR stylesheet if English is added later (§13 — language question still open).
- TanStack Query for all server state — critical given some stations may have unstable connections; configure sensible `staleTime`/retry behavior per endpoint.
- React Hook Form + Zod for forms; mirror the backend DTO shapes from `shared-types` so frontend and backend validation never drift silently.
- Route structure mirrors backend modules (`/fillups`, `/exceptions`, `/reports`, `/admin/users`, `/admin/stations`).
- Component library: plain Tailwind is fine to start; add shadcn/ui only if the team wants pre-built accessible primitives — not required for v1.
- Every list/table view that shows fill-up or driver data must respect the logged-in user's role — hide, don't just disable, actions the user lacks permission for, but remember the real enforcement is server-side (§8).

---

## 10. Migration & environment strategy

- All schema changes go through `prisma migrate dev` locally, committed as migration files, applied in staging/prod via `prisma migrate deploy` in CI/CD — never manual `ALTER TABLE` against prod.
- **Once any environment holds real data (Sabha go-live), existing migrations are never edited. Every change goes in a new migration.** Editing a migration in place is only acceptable before it has been applied anywhere with real data.
- Prefer additive migrations (new nullable column, new table) over destructive ones (drop column, rename). When a field genuinely needs to go away, deprecate it for one release cycle first.
- Three environments minimum: `dev` (local docker-compose Postgres), `staging` (mirrors prod, used for the directorate to review before each release), `prod`.
- Seed script (`prisma/seed.ts`) populates: the six known companies, the confirmed station list *tagged with company* (§13 blocks a fully clean import — seed what's solid now, re-run the seed once the client's company-attribution answers land), the four starting roles/permissions, and default `system_settings` values (`fillup.max_per_week = 3`, `fillup.min_gap_days = 2`).

---

## 11. Phased roadmap

Work through these as separate Claude Code sessions/branches, in order. Don't start a phase until the previous one's "done means" checklist is green — the rule engine and RBAC boundary tests in particular are not safe to build on top of if they're half-finished.

**M0 — Repo & security baseline**
Scaffold the monorepo (§2), docker-compose Postgres, NestJS app with helmet/CORS/ValidationPipe/global exception filter wired in, CI running lint+typecheck+test on every PR.
*Done means:* `pnpm dev` boots both apps, CI is green on an empty test suite, `.env.example` is complete.

**M1 — Auth, RBAC, Users, Companies, Stations**
Implement the schema in §4 for these entities, the permission guard (§5), login/refresh/logout, and seed the four roles + six companies + the currently-solid station rows (flag rows still pending company attribution, don't silently guess).
*Done means:* the station-scoping e2e boundary test (§8) passes; you can log in as each of the four seeded roles and confirm what they can/can't see.

**M2 — Drivers, Owners, Vehicles**
Driver/owner/vehicle CRUD, the driver-vehicle association, plate history tracking.
*Done means:* changing a vehicle's plate doesn't orphan its fill-up history (write this as a test, not just a manual check).

**M3 — Fill-up transactions + rule engine**
Build `FillUpRuleEngine` (§6) as pure, unit-tested logic first, then wire it into the create-fill-up endpoint. Build the exception request/approve flow.
*Done means:* unit tests cover the weekly cap, the gap rule, and the exception override path; a rejected fill-up correctly offers the exception flow instead of a dead end.

**M4 — Reporting & dashboards**
Daily per-station report, violations/exceptions list, full history for a driver/vehicle, directorate-wide dashboard. Excel/PDF export.
*Done means:* a directorate_admin can pull the daily report for all ~100 stations without the query timing out — add the indexes from §4 before this phase, not after you notice it's slow.

**M5 — Hardening & deployment**
Full OWASP checklist pass (§8), load a realistic volume of seed data and check query performance, set up automated backups + tested restore, deploy behind TLS.
*Done means:* the restore procedure has actually been run once against a copy of prod data, not just documented.

**M6 — Connectivity resilience (pending client answer)**
If the client confirms unstable connectivity at some stations: add a local queue (IndexedDB) on the station client that batches fill-up submissions and syncs when connectivity returns, with clear UI feedback that a submission is pending sync. Skip this phase entirely if they confirm stable connectivity everywhere.

---

## 12. How to work with Claude Code effectively on this

- Drop the companion `CLAUDE.md` (delivered alongside this file) at the repo root before the first session — it's the condensed version of §3, §5, and §8 that Claude Code should treat as standing instructions.
- One phase (§11) per branch, per Claude Code session. Don't ask it to jump ahead to M4 while M1's boundary test is still red.
- After each phase, actually run the "done means" checklist yourself before merging — don't take a session's self-report of "done" at face value, the same way you wouldn't with a junior engineer's PR description.
- When a client answer arrives that changes a business number (week-start-day, max-per-week), the fix should be a `system_settings` row update or a new `ExceptionType`/`SecurityAuthority` row — if implementing an answer requires touching the Prisma schema or a controller, that's a signal the extensibility pattern in §3 wasn't followed somewhere, worth a second look before merging.

---

## 13. Open items still pending from the client

Cross-referenced to the follow-up letter already drafted for اللواء جمال العمامي. None of these block starting — the plan above is built specifically so each one slots in without a redesign.

| # | Question | Where it plugs into this plan |
|---|---|---|
| 1 | Company attribution for the 27 "مكاتب مبيعات الجنوبية" rows | `Station.companyId` seed data — re-run the seed once answered |
| 2 | Split of "نفط ليبيا / الطرق السريعة" (20 rows) into two companies | Same as above |
| 3 | Station list for شركة الراحلة | New rows in the seed, same schema |
| 4 | Scope: مديرية أمن سبها only, or all لجنة إعادة تنظيم المدن stations? | `Station.securityAuthorityId` — already nullable, ready either way |
| 5 | Who actually records a fill-up at each station? | Confirms/adjusts the `station_employee` role's permission set |
| 6 | Are the 4 proposed roles sufficient? | New rows in `Role`/`Permission`, no code change per §3 |
| 7 | Driver phone number still required? | `Driver.phone` already modeled as optional — make it required or drop it, a one-line schema change either way |
| 8 | Chassis number confirmed on Vehicle, not Driver | Already modeled correctly in §4 |
| 9 | Photo storage for driver ID/license? | Would add a `documentUrl` field + object storage integration — not yet in scope, small addition when confirmed |
| 10 | Legacy paper/Excel records to migrate? | Informs the seed/import script scope for M1–M2, doesn't change the schema |
| 11 | Administrative ID issuing authority / verifiability | Doesn't change the schema — informs whether verification is manual (now) or an API check (future) |
| 12 | Transit-traveler exception details | New `ExceptionType` row + business rule detail, no schema change |
| 13 | Medical exception details (cap increase vs. gap-only) | Same — `ExceptionType` + rule engine parameter, no schema change |
| 14 | The "200" figure — drivers or daily fill-ups? | Informs capacity planning for M5, not the schema |
| 15 | UI language: Arabic only or bilingual? | Affects `packages/shared-types` i18n scaffolding — cheap to add now, ignore until confirmed |
| 16 | Remote access needed for directorate staff? | Already satisfied by the web app being reachable over the network — confirm firewall/VPN posture at deployment |
| 17 | Internet stability at stations | Determines whether M6 is built |

Keep this table (or the standalone `docs/OPEN_ITEMS.md` copy) updated as answers arrive — it's the bridge between the client conversation and what actually changes in the codebase.
