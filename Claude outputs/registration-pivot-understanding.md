# The registration pivot — what changed, as I understand it

Written to check my understanding before anything gets designed or built against it — not a spec, not a schema proposal. Confirm or correct any piece of this before it becomes the basis for updating `claude-design-brief.md` or the next Claude Code prompt.

## The problem that triggered this

The original plan (round 13, already built) let a station employee register a brand-new vehicle inline, mid-fill-up, if it wasn't already in the system. In the client meeting, that got reconsidered: station employees are not well-educated, and a multi-step registration form — owner identity, chassis number, vehicle type, all of it — is a realistic point of failure for that role, not a convenience. What looked like a good idea (register on the spot, no separate errand) turns out to load the least-equipped role in the whole system with its most error-prone task.

## The fix: split registration out entirely, into its own role, at its own location

**A new role — registration employee.** Works out of a police station, not a petrol station. Their entire job is registering vehicles and owners — nothing else. They do **not** record fill-ups; that permission is explicitly withheld from this role, not just unused.

**The existing role — station employee.** Works the pump, exactly as already built. Their entire job is now recording fill-ups against an *already-registered* vehicle. They do **not** register new vehicles anymore — the inline "لا توجد نتائج — إضافة مركبة جديدة" path that round 13 just built for this role is being withdrawn from it, not kept as a fallback.

So the two frontline roles become strictly non-overlapping: one only registers, the other only fills up. Neither can do the other's job.

**The handoff between them is the QR code — which is why this reads as a pivot on top of round 13, not a separate feature.** When a registration employee finishes registering a vehicle, the owner leaves with a physical card, printed with that vehicle's QR (the same QR round 13 already built — a vehicle's `internalCode`, nothing else). The owner brings that card to any petrol station. The station employee's identification step becomes **scan the card, get the vehicle, record the fill-up** — the give-out half of the QR feature (vehicle detail page, WhatsApp share) was built for a driver's phone; this adds a second, physical distribution channel through a printed card instead, feeding the exact same scan-to-identify step round 13 already specified for the fill-up wizard.

**Supervisors and admins.** Admins keep reporting, settings, visibility into every registered vehicle and every fill-up — and eventually, across every municipality once more than one is live, not just the one they're standing in. Where supervisors fit — whether a station's supervisor now only supervises station employees while a separate supervisor covers registration employees, or one supervisor role spans both at a shared location — isn't something the client specified; flagging it rather than assuming either shape.

## The rollout is geographic, not all-at-once

This doesn't launch everywhere. It launches **municipality by municipality**, starting with Sabha. Concretely: the police stations that will act as registration points get mapped out one municipality at a time, and registration (in the new, centralized sense) only exists where that mapping has happened. What a not-yet-launched municipality does in the meantime — the old inline-registration behavior, or nothing at all — isn't specified; flagging rather than assuming.

## The part that changes the rule engine itself: quotas become per-municipality

This is the piece that isn't just a workflow change — it reaches into `FillUpRuleEngine`. Today, the weekly cap and minimum-gap rules are evaluated per vehicle and per owner, **system-wide** — a fill-up anywhere counts against the same quota as a fill-up anywhere else. The client wants that quota to reset per municipality instead. Their own example: a vehicle fills up in Sabha Saturday morning with 8.001 دينار of بنزين 95; that same vehicle traveling to a different municipality the same day should be able to fill up again there, because it's drawing against that municipality's separate allowance, not the one it already used in Sabha.

That means the rule engine's lookups — "how many times has this vehicle/owner filled up, how recently" — need to be scoped by *which municipality the fill-up happened in*, not evaluated globally. Worth being precise about which municipality that is, since the client's own example answers it but it's easy to build the other way by accident: it's the municipality of **the station where this fill-up is happening**, not some fixed "home municipality" on the vehicle or owner record. A vehicle doesn't carry one quota around with it — it draws against whichever municipality's quota corresponds to wherever it's currently filling up.

Worth noting there's already a foundation for this: the schema has a `Municipality` model and `Station.municipality` from the earlier station-data work — this isn't a brand-new concept to introduce, it's an existing field the rule engine doesn't currently key off of.

## Open questions this raises — not guessing at any of these

- **Where do "police stations" live in the data model?** They don't dispense fuel, don't need fuel-availability rows, and aren't the same kind of place as a petrol `Station` — but they're clearly a location, scoped to a municipality, with their own staff. Whether they're a new entity or a flagged variant of the existing one is a real design decision, not obvious from what the client said.
- **Does this connect to the existing `SecurityAuthority` model** (مديرية أمن سبها, already in the schema)? These are literally police-run registration points, which sounds related, but relatedness isn't the same as "is the same table."
- **Supervisor scope**, as above — split by role type, or shared per location.
- **A vehicle that's genuinely never been registered, showing up at a petrol station in a live municipality** — this reads as a hard block with no fallback, since the station employee now has no registration path at all, but worth confirming that's really intended (vs., say, some exception-style path a supervisor could still unblock).
- **Migration**: does per-municipality quota scoping apply retroactively to fill-up history already recorded under the old global rule, or only to fill-ups going forward once a municipality's rollout begins? Same category of question the project has flagged before (round 11's owner-identity backfill) — a real decision, not a default to pick silently.
- **What actually happens to round 13's just-built pieces** that assumed station-employee-side registration: the inline "إضافة مركبة جديدة" path and its `onCreated`/`onDuplicateFound` wiring, and the compact QR-on-success-screen state that only fires for a vehicle created *during* a fill-up transaction. Both were built around station employees registering vehicles — a scenario this pivot removes for that role entirely. Whether that code gets deleted, gated behind the registration-employee role instead, or something else, is worth deciding deliberately rather than leaving as dead code nobody decided about.

## What I'm confident I've got right, in one sentence each

Two new non-overlapping frontline roles, not one role with more permissions. Registration is centralized and physically separate from fuel stations, phased in by municipality starting with Sabha. The QR card is the bridge between the two roles — built once already, now serving a second distribution channel. And the weekly-cap/minimum-gap rules stop being one global quota per vehicle and become one quota per vehicle *per municipality*, keyed off where the fill-up is happening, not a fixed home location.
