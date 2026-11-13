# Transaction Search — Functional Contract

**Status:** Draft for design and engineering review  
**Document ID:** COMPONENT-TRANSACTION-SEARCH  
**Version:** 0.1  
**Planned release:** V1  
**Owner:** Query-builder UI state, predicate semantics and search result handoff. The [Breakdown page](../../05-pages/breakdown/FUNCTIONAL.md) owns when it opens and how results are displayed; [Money Model](../../MONEY_MODEL.md) owns transaction classifications.

## Purpose

Provide a **powerful local database search without exposing a query language or generative AI**. Users combine four understandable classes of conditions. This contract does not invent new transaction labels or modify financial classification semantics.

## SRCH-001 — Four always-present, initially empty filter groups

The builder displays exactly four stable filter groups in this order:

1. **Category**
2. **Date**
3. **Amount**
4. **Text**

**Acceptance criteria**

- On a fresh opening, each group's heading is visible and **has no applied conditions**.
- Each group shows an **Add** action even when empty.
- Each group supports appending further conditions of the same type.
- Each condition can be removed independently with an **X**.
- Removing the last condition returns the group to its empty **Add** state; the group's heading itself cannot be deleted.
- Blank/incomplete draft conditions do not accidentally narrow the query or silently apply as valid predicates.
- The user can clear all conditions.
- No label/tag filter, natural-language AI prompt or fifth filter group is required for V1.

## SRCH-002 — Query combination rules

**AND across different non-empty filter groups; OR between alternative conditions within a group**.

For example:

~~~text
(Category is Coffee OR Restaurants)
AND
(Date between 03 Oct and 18 Oct OR Date on 25 Oct)
AND
(Amount about £50 ±10% OR Amount over £200)
AND
(Text contains Tesco OR Text contains Amazon)
~~~

**Acceptance criteria**

- Multiple selected categories mean **any selected category**, not all categories simultaneously.
- Multiple date rules select the union of matching date sets.
- Multiple amount rules select the union of matching numeric ranges/conditions.
- Multiple text rules select the union of corresponding text matches.
- A filter group with no conditions imposes **no restriction**.
- No hidden predicate restricts results to the previously viewed period. An empty query explicitly applied matches all imported records; the result view must explain that scope.
- The UI presents a concise, inspectable summary of the active restrictions.

Future advanced AND subconditions **within a filter group** require a separately designed, unambiguous grouping interface; do not add arbitrary nested Boolean expressions silently.

## SRCH-003 — Category conditions

**Acceptance criteria**

- User can select one or multiple individual categories per condition.
- Category choices come from the app-owned category database, not a fixed illustrative list.
- The user may create an app-owned category elsewhere according to the product's classification workflow; search does not invent or require independent labels.
- Search matches classified transaction portions; split transactions remain linked to their single imported parent transaction.
- Category names and any unclassified-state handling are accurate to the local data model.

A holiday can be represented as a category **if deliberately classified that way**, but there is no separate "Holiday label" model in this search feature.

## SRCH-004 — Date conditions

**Acceptance criteria**

- Support **On**, **Before**, **After** and **Between** dates.
- A Between condition shows start and end date controls side by side when space permits.
- Consecutive date conditions can be added and removed; they combine with OR.
- Exact-day searches match the relevant calendar day regardless of transaction time.
- Date Between includes both endpoints; Before and After should be explicit about whether they exclude their reference dates (default: strict Before/After).
- Transaction time-of-day and time-zone interpretation must be consistent with the domain/app locale; finer clock-time filtering may be added inside Date rather than as a fifth filter type.
- Invalid/reversed ranges produce understandable validation rather than silently giving misleading matches.

## SRCH-005 — Amount conditions

Support **Exactly**, **Greater than**, **Less than**, **Between**, and **About (± tolerance)**.

**Acceptance criteria**

- Amount comparisons use a user's clearly identified **absolute monetary amount** for a payment, not the raw plus/minus sign as a substitute for event semantics.
- Exactly uses exact currency-minor-unit equality, **not fuzzy matching**.
- Between includes both endpoints; greater/less are strict.
- About £50 ±10% matches the inclusive range **£45–£55** in GBP.
- Default About tolerance is **±10%**, adjustable with a slider; its current percentage remains visible.
- The **compact amount input and tolerance slider occupy the same horizontal row** on a phone where possible. The amount field need only fit around five digits; the slider takes the remaining usable width.
- Exact formatting, currency symbol and slider appearance belong to Figma/design tokens.
- A compact field does **not** impose a £10,000 maximum search amount. Large values remain enterable and accurately interpreted.
- The resolved inclusive range is shown beneath the controls.
- Percentages are evaluated against monetary minor units, with explicit and consistent boundary rounding.
- A zero amount and zero tolerance behave predictably; invalid/negative tolerance values are rejected.
- Multiple amount conditions can be ORed without narrowing to their intersection unintentionally.

**Note:** "About" is a deterministic numeric range, **not AI** and not fuzzy string matching.

## SRCH-006 — Text conditions and fuzzy matching

Text conditions cover available merchant names, descriptions and other explicitly indexed local text fields.

**Acceptance criteria**

- Match is case-insensitive and normalises common text differences.
- Exact/substring matches are prioritised over approximate matches.
- Typo-tolerant matching is supported, subject to a deterministic threshold and practical performance.
- Approximate matches are identifiable and may rank below stronger matches.
- An unsuccessful or unavailable fuzzy matcher never makes exact text lookup impossible.
- Blank text imposes no filter.
- Text matching does not make Amount or Date approximate.
- Search stays on-device/local and uses no generative AI or server-based query processing.

**Engineering decision later:** choose an appropriate Flutter/Dart library or local indexing strategy and a tested relevance threshold. Python/RapidFuzz is an inspiration, **not a requirement to embed Python in Flutter**.

## SRCH-007 — Search modal interaction

**Acceptance criteria**

- Search launches from **Breakdown → Overview**, not from every top-level scope tab.
- The underlying page is softly dimmed and/or blurred behind a floating, translucent sheet; exact "glass" material belongs to Figma.
- Sheet height adjusts or scrolls as conditions are stacked, without hiding primary actions.
- Opening starts with four visible empty groups; **dismissal without Apply** retains the previous results, not the uncommitted edits.
- The user can apply the query through **Show results**, returning to Breakdown with visible applied restrictions and an accurate result count.
- Opening the builder for later refinement restores the applied query into editable draft form, instead of losing it.
- Escape/Back and an accessible close action can dismiss the modal.
- Blur is decorative and must not compromise text contrast or focus, especially with reduced transparency/motion preferences.

## SRCH-008 — Results and navigation

**Acceptance criteria**

- The exact same query powers Categories and Transactions result modes.
- Results include the matching transaction count and an aggregate with an **explicit financial meaning**; don't sum income, saving contributions, withdrawals and purchases into an unlabelled "spending" total.
- The user can inspect an individual matching transaction and return with filters intact.
- Visible removable restrictions make it clear when the results cover a specific period, one category or **all imported history**.
- No-results state offers a clear way to adjust/clear conditions.
- Filtering and aggregate calculations must honor transaction scopes, categories, split portions, refunds and event types as specified in [Money Model](../../MONEY_MODEL.md). Search doesn't decide those semantics.

## SRCH-009 — Reliability and privacy

**Acceptance criteria**

- Work offline using the local transaction database and classification metadata.
- Do not send query terms or transaction details to an LLM or third-party search endpoint.
- Common searches remain responsive for realistically sized local transaction histories; use appropriate indexing and query cancellation.
- Disabling animations, keyboard-only navigation and assistive technologies does not remove search functionality.
- User-owned text or merchant metadata is not executed as a query/program; sanitise inputs and use safe parameterisation.

## Examples for acceptance tests

| Query | Expected |
| --- | --- |
| Category Coffee + Date 03–18 October | Coffee activity in that inclusive date window |
| Category Coffee OR Restaurants + Date 03–18 October | Either category in that window |
| Date 03–18 October OR Date 25 October | Any matching date in either interval |
| Amount About £50 ±10% | Amount in £45–£55 inclusive |
| Text Tesco | Strong exact/substring merchant matches first; permitted fuzzy matches after |
| Four groups empty, explicitly Apply | All imported history, clearly labelled |
| Category Coffee + Amount Exactly £50 | Exact £50 coffee activity only, no £49.90 "close" match |
| Cancel a changed query | Previously applied result set remains intact |

All example figures are test fixtures, not design-system tokens or actual account data.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../../00-workflow/OWNERSHIP_MAP.md>)
- [docs/05-pages/breakdown/DESIGN_INTENT.md](<../../05-pages/breakdown/DESIGN_INTENT.md>)
- [docs/05-pages/breakdown/FUNCTIONAL.md](<../../05-pages/breakdown/FUNCTIONAL.md>)
- [docs/05-pages/home/FUNCTIONAL.md](<../../05-pages/home/FUNCTIONAL.md>)
- [docs/ACCEPTANCE_SCENARIOS.md](<../../ACCEPTANCE_SCENARIOS.md>)
- [docs/PRODUCT_SPEC.md](<../../PRODUCT_SPEC.md>)
- [docs/UX_SPEC.md](<../../UX_SPEC.md>)
<!-- GENERATED: BACKLINKS END -->
