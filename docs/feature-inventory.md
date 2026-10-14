# Feature inventory (Phase 6, Part A4)

Written as an inventory, before anything on it was removed. The client then
decided (see OPEN_ITEMS #64 (b), (g), (h), (i)): the emergency override is
replaced by the no-card search, institutions are removed, exceptions are
redesigned (types with daily limits, no approval, standing exceptions removed),
the guided tour is removed, the dashboard is merged into «اليوم», the test card
is merged into the printer setup card, and vehicle types and exception types
live in «القوائم». Everything else on the list was kept.

"Main daily flow" means: scan card → confirm vehicle → fuel and amount → review
→ done at the pump, and issuing and printing a card at the office.

| Feature | Screen(s) | Role(s) | One plain Arabic line | Used by main daily flow? | Recommendation |
|---|---|---|---|---|---|
| Record a fill-up | `/fillups/new` | Station employee, supervisor | تسجيل تعبئة بمسح بطاقة المركبة | **Yes (the flow)** | Keep |
| Emergency override | `/fillups/new`, inside the scan step | Station supervisor (permission `fillups:emergency_override`) | تفويض طارئ لتعبئة مركبة مسجّلة بدون بطاقة بسبب مكتوب | Not by design: only when the card cannot be read | **Question for the client** (A4): keep as a supervisor-only fallback, or remove? Without it a worn card stops that vehicle completely until reprinted. It is limited to registered vehicles, needs a written reason, is audited, and shows in reports as an exception. Recommend keep. |
| Exceptions (record, approve) | Review step → exception step; `/reports/violations` | Supervisor (record, approve); employee can only be refused | تعبئة رُفضت بقاعدة تُسجَّل كاستثناء بسبب وإثبات ويعتمدها المشرف | Only when a rule trips | Keep. It is the answer to "a rule says no but the supervisor knows better". |
| Violations list | `/reports/violations` | Supervisor, municipality manager, admin | قائمة الاستثناءات والتعبئات المرفوضة للمراجعة | No | Keep, but see "merge" below with the daily report. |
| Standing exceptions | `/admin` area / vehicle page (permission `standing_exceptions:manage`) | Supervisor, admin | إعفاء دائم لمركبة من قاعدة محددة لمدة محددة | No | Keep only if the client uses it for ambulances/official vehicles; otherwise remove. Not seen in the daily flow. |
| Correction requests (vehicle / owner change) | `/vehicles/change-requests`, vehicle page | Station staff request, registration supervisor approves | طلب تصحيح بيانات مركبة أو مالك يوافق عليه مكتب التسجيل | No | Keep: station staff cannot edit vehicles, so this is the only legitimate way to fix a wrong plate or colour. |
| Vehicle types admin | `/admin/vehicle-types` | Super admin | قائمة أنواع المركبات | No | Keep (lookup table; rare edits). Could merge into one «القوائم» page with exception types. |
| Exception types admin | `/admin/exception-types` | Super admin | قائمة أسباب الاستثناء | No | Keep, same merge suggestion as vehicle types. |
| Routes (مسارات) | station form, list filters | Super admin / municipality manager | مسار الإمداد الذي تتبعه المحطة | No | Keep only if the client plans per-route reporting; otherwise remove from the station form. |
| Institutions / owners that are institutions | owner form, rules | Registration staff | مالك مؤسسة تُطبَّق على مركباتها قواعد المركبة وحدها | No | Keep: needed so a bank's fleet is not blocked by an owner-level cap. |
| Dashboard | `/reports/dashboard` | Supervisor and above | لوحة أرقام اليوم والأسبوع | No | **Merge** with the daily report (below). |
| Daily report | `/reports/daily` | Supervisor and above | جدول تعبئات يوم واحد لمحطة | No | **Merge** with the dashboard: the dashboard's figures are a header of the daily report. Two screens answer "what happened today". |
| Role reports (ops reports) | `/reports?report=…` | Each job its own | تقرير للمحطة / المكتب / البلدية / الجهات | No | Keep: this is the single reports destination. |
| Registration office report | `/reports?report=office`, `/my-office` | Office manager, municipality | بطاقات ومركبات وموظفو المكتب لكل يوم | No | Keep. |
| Per-employee activity page | `/reports/registration/employees/:id` | Office manager | نشاط موظف تسجيل واحد | No | Keep (cheap, answers "who printed what"). |
| Guided tour | overlay on first login | Everyone | جولة تعريفية تظهر مرة واحدة | No | Remove or shorten: it blocked automated tests and nobody has asked for it. Low risk either way. |
| Activity logs | `/admin/audit-log`; municipality «سجل النشاط» tab | Super admin; municipality manager | سجل من فعل ماذا ومتى | No | Keep. It is the audit trail the system promises. |
| Notification: pending exception | bell | Supervisor | استثناء بانتظار الاعتماد | No | Keep |
| Notification: no manager | bell | Admin | محطة أو مكتب بلا مدير | No | Keep |
| Notification: unprinted replacement | bell | Office manager | بطاقة بديلة لم تُطبع بعد | No | Keep |
| Notification: low fuel stock | bell | Supervisor, municipality manager | مخزون وقود منخفض | No | Keep (fuel stock is a separate feature, not blank cards). |
| Notification: account locked | bell | Manager | حساب قُفل بعد محاولات خاطئة | No | Keep |
| Notification: rule / setting changed | bell | Affected roles | تغيّر حدّ أو قاعدة | No | Keep, or reduce to the audit log if the bell is noisy. |
| Removed in Phase 6 | — | — | البطاقات الفارغة، الجاهزية، مرحلة السماح/التوعية، ورقة المحطات | — | Done (see report). |
| CSV vs PDF exports | report pages | Supervisor and above | تصدير جدول إلى ملف | No | **Merge**: keep PDF for printing and one CSV button per table. Today some reports have both and some only one, which is confusing. |
| Companies admin | `/manage` → companies | Super admin, municipality manager | شركات الوقود التي تتبعها المحطات | No | Keep (station key is `(company, station number)`). |
| Desks and printers | office page → «المكاتب والطابعات» | Office manager | أجهزة الطباعة ومكاتب الموظفين داخل المكتب | **Yes** (a print is recorded against a desk) | Keep. |
| Fuel stock (deliveries, levels, reset) | station page → «الوقود والمخزون» | Supervisor, manager | مستوى الوقود في الخزانات | No | Keep or remove by client choice. It is the largest feature outside the daily flow; confirm it is actually kept up to date at stations. |
| Rule switches / settings | `/admin/settings` | Super admin | حدود القواعد وأسعار الوقود | No | Keep. |
| Station and office archive | detail pages | Managers | أرشفة بدل الحذف | No | Keep. |
| Printer setup card | office card page | Registration staff | بطاقة اختبار للطابعة بخطوط ورمز QR | Yes (once per printer) | Keep (new). |
| Test card | office card page | Registration staff | بطاقة اختبار بسيطة | Yes (once per printer) | **Merge** into the printer setup card, which does the same job better. |
