# Breakdown — Functional Specification

**Status:** Draft for product/design review; aligned with the approved Breakdown mockup  
**Document ID:** PAGE-BREAKDOWN-FUNCTIONAL  
**Version:** 0.1  
**Planned release:** V1

## 1. Purpose, authority and boundaries

Breakdown answers **"What makes up these financial totals, and which individual transactions explain them?"**

It is the primary local transaction-exploration page, formerly called **Explorer** in legacy documents. It combines four scopes (Overview, Living, Fun, Savings) with two ways of examining each scope (Categories, Transactions).

This document owns the page's scope selection, presentation modes, drill-down behaviour and navigation/state handoff. It **does not** own the meaning or calculation of income, budget base, category actuals, contributions, withdrawals, refunds or exclusions: see the [Money Model](../../MONEY_MODEL.md).

The reusable search-builder semantics live in the [Transaction Search Contract](../../04-components/features/TRANSACTION_SEARCH.md). Design rationale and provisional visual arrangement are in [Pre-Figma Design Intent](DESIGN_INTENT.md). [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md) governs clarity, discoverability, restraint and interaction quality.

**Do not implement obsolete Explorer search suggestions or pie charts from the [legacy UX document](../../UX_SPEC.md) as competing requirements.**

## 2. Navigation model

The page has two independent selectors:

| Dimension | Choices | Purpose |
| --- | --- | --- |
| Top-level scope | **Overview**, **Living**, **Fun**, **Savings** | Which financial facts and transactions are being examined |
| Secondary view | **Categories**, **Transactions** | Composition of the matching records vs chronological individual records |

There are no third-level permanent page tabs and **no pie/donut chart** in Breakdown. The segmented budget bar provides the graphical composition view.

The active budget period is clearly identified and can be changed without leaving Breakdown. See [Home's period dependency](../home/FUNCTIONAL.md) for the unresolved authoritative payday-period model.

### BRKD-001 — Scope switching

**Acceptance criteria**

- Exactly four top-level options are available: Overview, Living, Fun, Savings.
- Changing scope updates the header bar, category list and transaction list consistently for the selected period.
- **Overview** includes individual categories from **all three** super-categories; it does not display only three super-category rows.
- Living, Fun and Savings display only the **individual categories mapped to that super-category**. Category membership comes from user-owned classification, not from hardcoded merchant names.
- Scope changes do not silently mutate categories, classifications or the financial period.
- Income is a financial event type contributing to budget base, **not a fourth allocation super-category**.

### BRKD-002 — Two views per scope

**Acceptance criteria**

- Both **Categories** and **Transactions** are available in all four scopes, with their labels written exactly that way.
- Categories is the composition view; Transactions is the chronological list view.
- Switching between views preserves the scope, selected period and applicable search state.
- Neither view inserts an additional pie chart.
- A deep link to a specific transaction or category does not require the user to reconstruct its original scope manually.

## 3. Shared summary and composition bar

### BRKD-003 — Scope-aware budget header

The page begins with the selected period and a budget summary bar. The **bar structure is shared**, but its denominator is relevant to the selected scope:

- **Overview:** period **budget base** (the eligible income used to set allocations).
- **Living:** period Living allocation target.
- **Fun:** period Fun allocation target.
- **Savings:** period Saving allocation target.

The header is not a running bank-account balance. It does not treat incoming transfers from savings as new income or outgoing savings contributions as purchases. See [Money Model](../../MONEY_MODEL.md) and [Monzo Integration](../../MONZO_INTEGRATION.md).

**Acceptance criteria**

- The displayed header amount is identified unambiguously as budget base or category-specific target, as appropriate.
- Income contributes to the Overview budget base only when its classification and budget-base flag permit it.
- Changing scope updates the numerical reference and segments without carrying irrelevant values from the previous scope.
- The same selected period is used by the header and the lists below it.
- A zero, missing or invalid target does not result in infinite percentages or a falsely normal progress bar.

### BRKD-004 — Category-segmented progress bar

The summary's graphic is **one or more horizontal budget-length rows**. Every included amount has an identifiable source category. Unused budget is a neutral grey remainder.

Segment semantics:
- **Living:** category segments represent included Living spending.
- **Fun:** category segments represent included Fun spending.
- **Savings:** category segments represent gross saving contributions, grouped by their Saving categories. Saving withdrawals remain visible in transaction history and in a separate compact net-movement fact where appropriate, but **do not reduce gross contribution progress**.
- **Overview:** segments represent included Living spending, included Fun spending and gross Saving contributions, grouped by their **individual categories**. These are allocations of the budget base, not a claim about the bank balance.

This is a **composition bar**, not a set of three segments for the three super-categories. A category keeps a stable, distinguishable identity across rows and corresponding list entries. Exact colours, legends and segment affordances belong to Figma and the later design system.

**Acceptance criteria**

- If relevant amounts use 75% of their budget reference, the filled segments occupy 75% of the first row; the remaining 25% is grey.
- Segment proportions reconcile to the financial amounts displayed in the category list, subject to explicit rounding.
- Distinct individual categories are identifiable without relying solely on arbitrary colour.
- A category that is split across a 100% row boundary retains its identity on both rows.
- For Savings, contributions above target are not misrepresented as problematic overspending.
- If monetary adjustments cause negative category totals, do not silently clip their effect into a misleading positive-only composition; the financial model and a future component contract must specify their treatment.
- Income events and internal transfers are never double-counted as category consumption solely because they appear as bank movements.

### BRKD-005 — Overflow at actuals above target

The bar continues by wrapping to **additional full budget-length rows** rather than compressing actual values into the first row or discarding their category identity.

**Acceptance criteria**

- At 100% used: one complete row.
- At 238.3% used: two complete rows and 38.3% of a third row.
- At 300% used: three complete rows; at **300% over target**, four complete rows (400% used).
- In each subsequent row, segments still identify **which individual categories** account for the additional value.
- Above-target Living/Fun states have a separate factual over-target indicator; category segments are not replaced by anonymous red.
- Extremely large values do not cause uncontrolled layout growth: progressive rendering/scroll or another proportional strategy is acceptable if amounts and category attribution remain inspectable.
- No remaining-grey segment is shown for a complete 100% row.
- For target ≤ 0, use explicit "No usable target" behaviour, not percentage division or invented grey proportions.

Overflow's domain meaning is identical across Home and Breakdown; this page owns category-level composition, while [Home](../home/FUNCTIONAL.md) owns its own summary presentation.

## 4. Categories view

### BRKD-006 — List of individual categories only

The Categories view lists **actual categories**, not super-category headers such as "Living" or "Fun" as substitutes for categories.

**Acceptance criteria**

- Overview displays categories drawn from Living, Fun and Savings, such as Groceries, Restaurants, Shopping and Investments, whenever present in the selected data.
- Living includes only categories mapped to Living; Fun only those mapped to Fun; Savings only those mapped to Savings.
- Each category row includes its name, financial amount and a useful proportional indicator relative to the selected scope (where that proportion is meaningful).
- Categories are normally ordered by amount, with a predictable tie-breaker; sorting may be expanded later.
- No spending in a category is not silently presented as a successful budget result. Zero/empty states are explicit.
- In Overview, saving contributions must not be labelled "spending" merely because they are grouped with Living/Fun amounts.

### BRKD-007 — Expand to constituent transactions

Tapping a category reveals its individual matching transactions **within the same page context**.

**Acceptance criteria**

- Expanding Restaurants reveals the relevant restaurant transaction rows within the active period and scope.
- Expanded transactions reconcile to the category's displayed amount under the [Money Model](../../MONEY_MODEL.md), including any applicable refunds, splits or excluded-event logic.
- A transaction row can be selected to inspect its detail.
- Expansion is reversible and does not navigate to an unrelated screen.
- Switching scope, period or query cannot leave stale transaction children visible under an unrelated category.
- Navigation/scroll state is retained when sensible and does not overwhelm the interface with an unbounded stack of expansions.

## 5. Transactions view and transaction details

### BRKD-008 — Chronological transactions

The Transactions view lists individual matching bank records, normally newest first, with optional date grouping. It does not require the user to expand categories first.

**Acceptance criteria**

- Overview provides access to **all imported event types**, including income, purchases, saving contributions, saving withdrawals and internal transfers; each is clearly identified by its **financial meaning**.
- Living/Fun scope lists activity attributable to that scope under the domain classification rules; Savings includes both saving contributions and withdrawals associated with Savings.
- Each row contains at least the available date, merchant/description, monetary amount, category (if known) and exceptional event/scope indicator when relevant.
- Bank-source signed amounts are not naively treated as financial meaning: e.g. a negative Moneybox payment may be a savings contribution, not a shopping expense.
- Searchable **excluded** events and unclassified records remain inspectable through the all-transactions route rather than disappearing.
- The transaction list is not incorrectly expected to sum to the displayed category progress if it also includes income, withdrawals, transfers or excluded events.

### BRKD-009 — Transaction detail and correction

Selecting an individual transaction opens a focused detail view or sheet.

**Acceptance criteria**

- Show date/time, amount, merchant/description, and selected classification/category/scope.
- Show additional available Monzo metadata only where reliable, relevant and privacy-appropriate; do not fabricate location or merchant detail absent from the API.
- User can correct the **app-owned** event type, category, included/excluded flag, split portions and notes when supported by the financial model.
- User can optionally create a matching classification rule and undo a correction.
- The original imported bank record remains intact; app-owned metadata/classification may change independently.
- Updated classifications propagate to category rows, bars, transactions and dependent Home/Trends summaries.
- If a split spans categories or super-categories, its constituent portions must be traceable without duplicating the underlying bank payment.

## 6. Search entry and result integration

### BRKD-010 — Search is launched only from Overview

**Acceptance criteria**

- The search action is available in **Overview** and is not duplicated as a permanent action on Living, Fun and Savings.
- Activating it opens a dismissible modal over a dimmed/blurred view, without navigating to an unrelated page.
- Search operates on Vibe Ledger's **local database**. It requires no generative AI, no network round-trip and no bank-side search API.
- Search's four groups, condition operators and query semantics are owned by the [Transaction Search Contract](../../04-components/features/TRANSACTION_SEARCH.md).
- Dismissing the modal without applying does not silently replace the current results.
- Applying a query presents the result in Breakdown, with active restrictions inspectable and removable.
- The user can inspect the matching results as **Categories** or **Transactions** without changing the query.
- Query results have their own result count and relevant aggregate. Do not reuse an unfiltered budget total as though it were the sum of matching transactions.

### BRKD-011 — Search scope is explicit

**Acceptance criteria**

- Opening the search builder displays all four filter groups **empty**; there is no hidden selected period, category or amount predicate.
- With no conditions, the query means **all imported history** when explicitly applied; it does not silently constrain to the page's previously selected month.
- If the normal page has a selected period but search results cover all history, the UI explicitly signals **All dates** / **All imported history**.
- Existing page-to-page filter handoff from Home or Trends is visible and can be cleared/adjusted; ordinary prefiltered navigation is not a hidden advanced search predicate.
- Closing search results returns to the prior unqueried page state predictably.

## 7. Saving and income semantics

### BRKD-012 — Savings are not income or expenditure

**Acceptance criteria**

- A £200 outgoing transfer to a saving pot or Moneybox can display as **£200 contributed to savings**, subject to classification.
- A £200 incoming transfer from a saving pot can display as **£200 withdrawn from savings**, and does not increase budget base automatically.
- £5,000 of bonus income followed by £5,000 transferred into savings increases the budget base by £5,000 and gross Saving contributions by £5,000; the current account returning to its previous balance does **not** cancel either fact.
- Savings progress uses gross contributions. Net savings movement is a separate metric: contributions minus withdrawals.
- The Savings interface uses concise accurate labels and **no permanent explanatory paragraph/card**.
- Transfers between ordinary cash accounts have zero budget effect unless explicitly classified otherwise.
- When a source event is ambiguous, the user can correct its meaning; the application must not confidently infer "saving" solely from the sign of the Monzo amount.

See [Money Model](../../MONEY_MODEL.md), [Monzo Integration](../../MONZO_INTEGRATION.md), and legacy [Acceptance Scenarios](../../ACCEPTANCE_SCENARIOS.md) for financial examples.

## 8. State, accessibility and failure handling

### BRKD-013 — Consistent state and navigation

**Acceptance criteria**

- Period, scope, secondary view, category expansion and query-result state are coherent and do not leak stale data across contexts.
- Home's category-summary and exact-date drill-down produces inspectable Breakdown context; returning preserves relevant Home state as specified in [Home](../home/FUNCTIONAL.md).
- A Trends or Subscriptions drill-down can carry an exact date/period, category or transaction identity without having Breakdown silently broaden it.
- On a retained tab session, switching away and back preserves useful state unless the user explicitly clears it.
- The bottom navigation includes Home, Breakdown and Trends; other planned destinations follow their separate release plan, not a page-specific assumption.

### BRKD-014 — Empty/offline/performance and accessibility

**Acceptance criteria**

- Empty periods, missing metadata, zero targets and no query matches display factual, helpful empty states.
- Locally imported transactions remain explorable offline; stale sync state is not disguised.
- Long lists and extreme overflow remain responsive through suitable list rendering.
- Colour is not the only means of distinguishing category identity, remaining budget, overage or saving direction.
- Category expansion, switching views, opening details and launching search are keyboard/screen-reader reachable.
- Reduced-motion preferences preserve full function; the frosted modal's text must remain readable even without blur/translucency support.

## 9. Handoff and outstanding decisions

- Final spacing, colours, iconography, modal materials, motion, bar segmentation/legend, and component shapes belong to Figma and the later design system. See [Pre-Figma Design Intent](DESIGN_INTENT.md).
- The [Money Model](../../MONEY_MODEL.md) and [Data Model](../../DATA_MODEL.md) currently define calendar months; the custom payday-period model is unresolved and **not defined here**.
- A financial-component contract must address negative net category amounts, currency, rounding, partial rows, extreme overflow and Savings withdrawals consistently.
- The exact data contract for opening Breakdown from Home/Trends/Subscriptions needs cross-page acceptance tests.
- The detailed transaction editor, accessibility treatments and extra metadata fields need component and Monzo-adapter validation, not invented UI content.

The approved mockup establishes the intended **structure**, not permission to change financial invariants or skip unresolved edge cases.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../../00-workflow/OWNERSHIP_MAP.md>)
- [docs/04-components/features/TRANSACTION_SEARCH.md](<../../04-components/features/TRANSACTION_SEARCH.md>)
- [docs/05-pages/breakdown/DESIGN_INTENT.md](<DESIGN_INTENT.md>)
- [docs/05-pages/home/FUNCTIONAL.md](<../home/FUNCTIONAL.md>)
- [docs/ACCEPTANCE_SCENARIOS.md](<../../ACCEPTANCE_SCENARIOS.md>)
- [docs/PRODUCT_SPEC.md](<../../PRODUCT_SPEC.md>)
- [docs/UX_SPEC.md](<../../UX_SPEC.md>)
<!-- GENERATED: BACKLINKS END -->
