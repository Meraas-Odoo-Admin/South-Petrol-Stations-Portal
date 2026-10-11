# Phase 4b report (draft, grows as the phase proceeds)

## 1. Before: critique of the current users screen

Method: dual-agent (A: design review, source-only · B: detector scan). Browser overlay skipped: the app was not running during the assessments. A "before" screenshot is taken separately for the pair.

### Design Health Score (before)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Each checkbox fires an instant mutation with no pending or success state; one shared error line sits far above the panel. |
| 2 | Match system / real world | 2 | Roles as checkboxes contradict "one job per person"; station codes lead the scope column, names hide inside the panel. |
| 3 | User control and freedom | 1 | No edit of name or phone, no deactivate, reset or unlock; every checkbox saves instantly with no confirmation. |
| 4 | Consistency and standards | 2 | Uses the shared components, but the status pill looks like a control and is read-only; off-ramp text sizes. |
| 5 | Error prevention | 1 | Offers registration offices to a station employee, and the server refuses afterwards. Plain-text password field. |
| 6 | Recognition rather than recall | 2 | The role-to-scope link is held in the head; 100+ stations with no search or grouping. |
| 7 | Flexibility and efficiency | 1 | No search or filter on the list, no way to copy another person's places. |
| 8 | Aesthetic and minimalist design | 1 | Four equal-weight columns with 100+ rows and 13+ permissions all visible at once. |
| 9 | Error recovery | 1 | Generic errors, shown far from the cause; the create form guesses at causes. |
| 10 | Help and documentation | 2 | Good copy on direct permissions, but shown to everyone; nothing on why a role or place is refused. |
| **Total** | | **15/40** | **Poor** |

### Design specificity verdict
Mostly interchangeable. The tokens are on-brand, but the structure is the generic "table plus expandable row of checkbox columns". It does not express the product's central idea (two buildings, one key): fuel and registration jobs are mixed with only a faint suffix to tell them apart.

Deterministic scan: 8 findings, all one advisory rule, `design-system-font-size` (12px text at lines 260, 265, 288, 293, 310, 320, 340, 348 of UsersAdminPage.tsx). Not false positives for phone, where 12px is below the new 13px floor. The scan also exposed a gap in DESIGN.md itself: the desktop 12px step was not on its type ramp, which is fixed in this phase. The assessors also noted 10.5px and 11px helper text in faint ink on this page.

### Overall impression
Starts competent and ends helpless. The page lets an admin construct states that cannot exist, and offers no way out when a person leaves, forgets a password or is locked out. Cognitive load: 7 of 8 checklist items fail.

### What's working
1. Shared components and tokens are used correctly; one amber primary action.
2. Every mutation is audited server-side, and the first-login password change is explained.
3. The sentence explaining that direct permissions add to role permissions is the right kind of microcopy, in the wrong place.

### Priority issues
- **[P0] No way to deactivate, reset a password or unlock.** A leaver keeps access; a locked-out employee stays locked out. Fix: an account block on a person page with deactivate (outlined red, reason required), reset password (temporary password shown once) and unlock.
- **[P1] Roles are checkboxes though everyone has exactly one.** The control permits states the server later refuses. Fix: one job, picked from a list grouped by side, replacing the old one.
- **[P1] Places are a flat 100+ checkbox list and ignore the job.** Fix: show only the picker for the job's side, searchable, chosen places as removable chips, one explicit save.
- **[P1] A four-column panel opens inline under the row and is unusable at phone width.** Fix: a person page, single column on phones.
- **[P2] Extra permissions in plain view for every admin.** Fix: collapsed "Advanced" section, only for holders of `roles:manage`.

### Persona red flags
- **Alex (power user):** no search or filter, no keyboard path beyond tab order, 100+ single clicks to set places.
- **Sam (accessibility):** create-form labels not linked to inputs; text at 10.5 to 12px; error line not announced (no live region); inactive shown as a red pill, which the design rules reserve for broken rules.
- **Casey (distracted mobile user):** a 720px table scrolls sideways; the four-column panel is crushed; an accidental tap saves a change to someone's access with no confirmation.
- **Station supervisor on a phone in sunlight:** cannot reach the three things they need (add an employee, disable a leaver, reset a password); helper text in faint ink at 10.5px is unreadable in sun; they would see admin roles they can never assign.

### Minor observations
Ellipsis on the wrong side of the loading text for RTL; no retry or empty state; several queries have no loading or error handling; the amber primary flips to "Cancel" while the form is open; the admin subtitle lists tabs the user may not see; the creation form has no role field, so a new account needs a second visit.

### Questions to consider
Should the screen be a "who, what job, where" flow rather than an editing grid? Is a table the right view at all for a supervisor on a phone? Does an individual permission grant belong in the ordinary admin UI?

## 2. Screen plan (written before wiring the UI)

**Idea:** the screen follows how an admin thinks: who is this person, what is their job, where do they work. One job per person, and only the place picker that fits that job's side.

**Routes.** Admins: `/admin/users` (list), `/admin/users/new` (create), `/admin/users/:id` (person). Supervisors use the same three screens at `/staff`, `/staff/new`, `/staff/:id`, reached from their own menu entry «فريق العمل», not from «الإدارة». The components take a base path; what is offered comes from the server's answer (what this caller may do to this person), never from role names in the browser.

**1. List.**
- Header strip: title, count, one amber «حساب جديد» pill.
- Filter bar: search (name or username), side (الكل / محطات الوقود / مكاتب التسجيل / الإدارة), job, place, status. A summary chip row shows active filters with a «مسح الكل» action.
- Desktop: a table with name + username, job, where (names, "+2" for more), status pill, last login. The whole row opens the person.
- Phone: no table. Each person is a card (name large, job pill, where, status pill + word, last login), one tap opens the person. Filters sit behind a «تصفية» button.
- Status: نشط / موقوف / مقفل / يجب تغيير كلمة المرور; always a word, never red for routine states (deactivated is neutral; locked is amber).
- Server paging (25 per page), empty state with a clear next action, loading skeleton, retry on error.

**2. Person page.** Sticky header: back link, name, job pill, status pill. Then cards in this order:
1. **الهوية:** full name, username (read-only, with the reason it cannot change), phone. One save button.
2. **الوظيفة والمكان:** one job, chosen from a list grouped by side with a plain sentence per job; changing it shows what will be replaced and asks to confirm. Then only the picker for that side: a searchable list with the chosen places as removable chips; administration jobs say "يرى كل المحطات" and show nothing. One explicit save.
3. **الحساب:** deactivate or reactivate (reason required), reset password (temporary password shown once with a copy button and a plain warning that it will not be shown again), unlock (only when locked). Irreversible actions are outlined red pills with a confirm step.
4. **متقدم:** extra individual permissions. Collapsed, with a one-line warning, shown only to holders of `roles:manage`.
5. **آخر النشاط:** the latest entries about this account (who, what, when, reason).
- Phone: single column, full-width 48px buttons, 16px text; destructive actions are never next to the save button.
- When the caller may only read this person (a supervisor and an employee who also works elsewhere), every control is replaced by its value plus one line saying why.

**3. Create flow.** One page in three numbered steps: من (name, username, phone), الوظيفة (one job), المكان (picker for the job's side). The system generates the temporary password, so the admin never types one. On success: a confirmation screen with the password shown once, a copy button, and a link to the new person. For supervisors the job is fixed and shown (their own side's employee job) and only their own places are offered.

**Shared form patterns (recorded in DESIGN.md at the end).** Text field with label tied to the input, optional hint, error line with an icon and a word, and a disabled state that always says why.

## 3. Follow-up after the real-iPhone test

Fixes made before committing Phase 4b, with phone-width (390px) screenshots in `docs/phase-4b-screenshots/fixes/`:

- **iOS auto-zoom:** every text field is at least 16px on phone widths, set by one rule in `apps/web/src/index.css`; pinch-zoom stays enabled and the viewport tag gained `viewport-fit=cover`. Checked on the login, change-password and 4b screens (`phone-login-focused.png`).
- **Bottom bar:** one-word labels, equal widths, always visible, padded for the home indicator, for every kind of user (`phone-bar-*.png`, plus 320px for the supervisor and the admin). A registration employee gets their own tab.
- **Temporary password:** sized to the screen and never wrapped, in the mono font (`phone-temp-password-390.png`, `phone-temp-password-320.png`).
- **Home cards and menus:** one shared list, `apps/web/src/lib/navAccess.ts`; the home screen now has «الإدارة» and «فريق العمل» cards (`phone-home-*.png`), and the phone menu sheet can no longer omit a destination («تسجيل المركبات» was missing).
- **Violations badge:** the supervisors' 400 on every page came from the list endpoint demanding a station; the badge now reads `GET /reports/violations/pending-count`, limited to the caller's stations.
- **Tests:** `apps/web/e2e/phone.spec.ts` and a scoping test in `apps/api/test/reports.e2e-spec.ts`.
