# Budget Periods — Domain Contract

**Status:** Draft V1 replacement for calendar-month assumptions  
**Document ID:** DOMAIN-BUDGET-PERIODS  
**Version:** 0.1

## Responsibility and dependencies

Owns the definition, boundaries and change policy of budget periods. Settings owns the user-facing picker and preview: [Settings Functional Specification](../05-pages/settings/FUNCTIONAL.md). The [Money Model](../MONEY_MODEL.md) owns the meaning of income, ratios, spending and saving contributions; the [Data Model](../DATA_MODEL.md) owns persistence. [Home](../05-pages/home/FUNCTIONAL.md) and [Breakdown](../05-pages/breakdown/FUNCTIONAL.md) consume these periods without independently defining their boundaries.

The old monthly-period schema and examples in those documents are migration references, **not a permission to treat a non-calendar budget period as an ordinary calendar month**.

## PERIOD-001 — One monthly start-day rule

Choose exactly one day-of-month integer `d` in 1–31. The period end date is derived; users do **not** configure start and end days independently.

For calendar month `m` and year `y`:

```text
boundary(y,m,d) = local date (y,m,min(d,number_of_days(y,m)))
period(y,m,d)   = [boundary(y,m,d), boundary(next_month(y,m),d))
display_end     = day before next boundary
```

Ranges are **inclusive start, exclusive end** internally; UI displays an inclusive end date.

**Acceptance criteria**
- Starting on the 25th produces a 25th–24th cycle.
- Starting on the 31st uses 28 February 2027 and 29 February 2028, then returns to 31 March; the preference remains **31**, not the temporary fallback.
- A month with 30 days substitutes the 30th when the chosen date is 31.
- Every local calendar date falls into exactly one period: no skipped or duplicated days, including year boundaries and leap years.
- A period is identified by its unique start and end dates, not merely by a `YYYY-MM` key.

## PERIOD-002 — Date and time correctness

- Period membership is defined by **local calendar dates** in the application's chosen financial time zone; timestamps are stored in UTC and converted deterministically for membership.
- Leap years, differing month lengths, year boundaries and daylight-saving transitions must not shift a period by one date.
- Do not calculate calendar dates by adding fixed 24-hour durations to local midnight; use calendar-aware date operations.
- Date-only boundaries must not be ambiguously serialized as UTC midnight.

**Acceptance criteria**
- Tests cover 27, 28, 29, 30 and 31; both February lengths; and a daylight-saving transition.
- Tests show that `end(period_n) == start(period_n+1)` when using exclusive end dates.

## PERIOD-003 — Allocation and historical preservation

Budget base and three allocation targets are calculated per **budget period**, using the [Money Model](../MONEY_MODEL.md). Each period retains the ratios/targets applicable to it, including after it closes; new periods inherit the latest active allocation.

**Acceptance criteria**
- Updating the Home allocation does not rewrite ratios for closed periods.
- Reclassifying historical transactions may update historical actuals, but it does not silently rewrite the previously chosen target.
- Money-model monthly queries are migrated to period-keyed queries before custom periods ship; do not split one activity event across periods simply because a calendar month changed.

## PERIOD-004 — Editing the start day

Settings presents a single start-day selector and **a scrollable preview of the current and next 11 contiguous budget periods**. An adjusted *start date* alone is subtly underlined, with one small explanatory legend. Derived end dates are not underlined merely because they precede the next start.

**Acceptance criteria**
- Preview reacts immediately to unsaved selection, without mutating stored periods.
- Cancel leaves the active configuration unchanged; Apply validates and persists a new rule.
- Existing closed periods and budget targets are never automatically rewritten.
- A start-day change while a period is already in progress requires an **explicit, non-overlapping transition policy** with a preview of any shortened/extended bridge period. This transition is **open for implementation review**; agents must not silently choose a policy.
- Prevent applying a change that would yield gaps, duplicates or silently reassign previously closed dates.

## Required persistence/migration

The authoritative [Data Model](../DATA_MODEL.md) must evolve from legacy `monthly_budgets(month_key)` to explicit `budget_periods(id,start_date,end_exclusive,allocation_ratios,targets,closed_at,...)` and a versioned `budget_period_rule(start_day,effective_from,...)`. Do not implement two divergent budget-period authorities.

## Examples

| Selected start day | Period start | Displayed end |
| --- | --- | --- |
| 25 | 25 January 2027 | 24 February 2027 |
| 31 | 31 January 2027 | 27 February 2027 |
| 31 | 28 February 2027 | 30 March 2027 |
| 31 | 31 March 2027 | 29 April 2027 |

This contract defines calendar arithmetic; exact animations, preview spacing and modal material are left to Figma.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../00-workflow/OWNERSHIP_MAP.md>)
- [docs/05-pages/settings/FUNCTIONAL.md](<../05-pages/settings/FUNCTIONAL.md>)
- [docs/06-engineering/LOCAL_DATA_ARCHITECTURE.md](<../06-engineering/LOCAL_DATA_ARCHITECTURE.md>)
- [docs/DATA_MODEL.md](<../DATA_MODEL.md>)
- [docs/MONEY_MODEL.md](<../MONEY_MODEL.md>)
<!-- GENERATED: BACKLINKS END -->
