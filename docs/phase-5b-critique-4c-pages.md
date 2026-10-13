# Phase 5B — critique of the three 4c report pages (before they were folded)

⚠️ DEGRADED: single-context (no sub-agent tool was used; the design review and the detector were run one after the other in the same session). The deterministic detector (`impeccable detect` on `apps/web/src/features/regreports`) reported no findings; everything below is the design review, read from the source of the three pages and the client's own complaint. The pages were removed in this phase, so there is nothing left to screenshot.

Pages: «متابعة مكاتب التسجيل» (`RegistrationReportPage`, `OfficeEmployeesPage`), «مخزون البطاقات» (`CardStockPage`), «الجاهزية للموعد النهائي» (`ReadinessPage`).

## What the client saw, and why

| Complaint | Cause in the source |
|---|---|
| "The tables are unclear" | Each report was a page of its own with one headline block and 2–4 tables, some behind a «عرض الأرقام في جدول» disclosure, so the data a manager needed was hidden by default; the same numbers appeared as a chart, a table and a CSV. Column headers were `ink-soft` on white with no rule under them. |
| "Fields are misaligned (the «عدد الأيام الأخيرة للتقدير» field)" | A `TextField` with a hint, inside a flex row set to `items-end` next to two date fields and a station select. Its label plus its hint made it taller than its neighbours, so the input sat on a different baseline, with a width (`lg:w-56`) found nowhere else. A text input was also the wrong control for a choice of four sensible values. |
| "Too much white and grey, nothing guiding the eye" | Every block was the same white card on warm paper with `ink-soft` captions. The one number a reader came for (does registration finish before the deadline) was an 18–20px sentence under a heading and a pill, below the range bar and the filters, with a ✓ / ⚠ / ✕ glyph as its icon. |

## Heuristic read (0–4)

| Heuristic | Score | Note |
|---|---|---|
| Visibility of system status | 3 | Loading and error states were present and worded. |
| Match with the real world | 3 | Plain Arabic, but «pools» of stock per desk and per office were a developer's idea. |
| User control | 3 | Range presets and CSV/PDF were good. |
| Consistency | 2 | Three pages, three layouts for the same job (find the office, then the number). |
| Error prevention | 3 | |
| Recognition rather than recall | 2 | The office and its employees were two pages and two clicks apart; stock was a third. |
| Flexibility | 3 | |
| Aesthetic and minimalist design | 1 | Same-size stat cards in a row (the hero-metric template), unicode glyph icons, tables hidden behind disclosures, a CSV and a PDF button per block. |
| Help and documentation | 3 | A «كيف يُحسب» block on stock and readiness; it sat above the answer. |
| Recovery from errors | 3 | |

## What to change (and what was done)

1. **Put the content where the person already is.** An office manager lives in «مكتبي»; a municipality manager in «إدارة المحطات». The three pages became tabs and a top panel there. Done: office tabs, station tabs, summary row and readiness panel.
2. **Answer first.** One sentence at 22px with a status word at the top of the readiness panel, then the chart, then the details. Done.
3. **No free-text field for a choice.** The estimate window is a row of four buttons. Done.
4. **Hierarchy with the design system.** Teal for structure (tab underline, table title bars), amber for what needs a decision (summary figures, pills), green/amber/red pills that carry words, summary numbers large, tables with a header rule and row separators, no disclosure around data. Done.
5. **One table component** for every report, so a header, a sort and a CSV button always mean the same thing. Done (`OpsReportView`).
6. **Old addresses redirect** to the person's new place. Done.

## Questions left open

- Does the municipality manager still want the PDF of the readiness report? The CSV of every table exists; the PDF endpoints are kept on the API, but no button on the new panel calls them.
- Should the employee drill-down (`/reports/registration/employees/:id`, the activity list of one person) become a panel on the person page rather than its own page? It is kept as it was, linked from the office overview.
