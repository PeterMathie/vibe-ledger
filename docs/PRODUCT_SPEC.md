# Product Specification

## 1. Product definition

Vibe Ledger is a personal budgeting and spending-analysis application that imports Monzo transaction data and applies an app-owned budgeting model above it.

The defining feature is a two-level hierarchy:

```text
Transaction → Category → Super-category
```

Example:

```text
Black Sheep Coffee £4.20 → Coffee → Fun
```

The beta has three primary super-categories:

- **Living**
- **Saving**
- **Fun**

The user allocates a percentage of the month's **budget base** to each super-category. Default example:

```text
Living 50%
Saving 30%
Fun    20%
```

The percentages must total 100%.

The app focuses on super-category performance. It does not require a separate hard budget for every subcategory. Spending more on Coffee can be offset by spending less on Shopping if Fun remains within its monthly allocation.

---

## 2. Product goals

The beta must let the user:

- Import and refresh transactions from Monzo.
- Classify transactions according to their budget meaning.
- Group ordinary categories into Living, Saving and Fun.
- Set and edit monthly allocation ratios.
- See current target, actual and remaining/over amount for every super-category.
- See when spending occurs through a calendar heat map.
- Drill from any dashboard/trend visual into the exact matching transactions.
- See category and super-category behaviour over time.
- Search/filter the local transaction database.
- Track subscriptions with arbitrary billing intervals and a monthly equivalent.
- Correct automatic classifications quickly.
- Preserve a comprehensible history even when money is moved between pots/accounts.

---

## 3. Product non-goals for beta

The beta does not attempt to:

- replace Monzo as a bank;
- provide financial advice;
- use an embedded LLM;
- predict spending with AI;
- calculate investment returns;
- calculate credit scores;
- track FIRE/net-worth projections;
- infer which historic savings pot "funded" a later purchase after funds have mixed;
- decide whether spending was morally or financially "aligned" with a savings pot;
- provide a dedicated goals feature already covered adequately by Monzo;
- provide a dedicated month-comparison page;
- provide a dedicated calendar page;
- provide broad conversational natural-language finance analysis;
- become a public multi-bank fintech product during beta.

---

## 4. Monthly budget model

### 4.1 Budget base

Each calendar month has a `budget_base_amount`.

Default behaviour:

- transactions classified as **Income** and marked `counts_toward_budget_base = true` add to the month budget base;
- savings withdrawals do not add to the budget base;
- internal transfers do not add to the budget base;
- refunds/reimbursements do not add to the budget base unless the user explicitly reclassifies them as income;
- the user may override the automatically calculated budget base for a month.

This explicit budget base prevents a £6,000 savings withdrawal from being treated as "£6,000 earned this month."

### 4.2 Allocation

Each month stores its own immutable-after-month-end allocation percentages.

Example:

```text
September 2026
Living 50% = £1,500
Saving 30% =   £900
Fun    20% =   £600
Budget base = £3,000
```

The current month's percentages can be edited at any time. Changing October must not alter September.

### 4.3 Actual values

Living and Fun measure **budget-included spending**.

Saving measures **saving contributions** against the monthly Saving target.

The Home screen may additionally show **net savings movement**:

```text
gross saving contributions
− saving withdrawals
= net savings movement
```

This is deliberately separate from Saving target progress.

Example:

```text
Saving target:             £900
Contributed this month:    £900   ← 100% target achieved
Withdrawn from savings:  £5,000
Net savings movement:   −£4,100
```

This distinction preserves two useful facts:
1. the user allocated 30% of current income to saving;
2. the user's total savings nevertheless fell because old savings were withdrawn.

---

## 5. Core navigation

### 5.1 Home

Purpose: **How am I doing this month?**

Contains:

- month selector;
- current budget base;
- editable allocation visual (Living / Saving / Fun);
- exact percentage and £ target for each super-category;
- Living status;
- Saving status;
- Fun status;
- runover visual for allocations;
- daily spending heat map;
- secondary net-savings movement indicator;
- drill-down links into Explorer.

### 5.2 Explorer

Purpose: **Where did the money go?**

This is the canonical transaction/database page.

Contains:

- date selection;
- summary metrics for the active filter;
- super-category split;
- category breakdown;
- transaction list;
- search;
- structured filter chips;
- transaction editing;
- split transaction support;
- include/exclude override;
- rule creation.

All other views deep-link into Explorer with filters.

Examples:

- Heat-map day → `date = 2026-09-19`
- Fun runover → `month = current AND super_category = Fun`
- September Shopping stack → `month = 2026-09 AND category = Shopping`
- Subscription → `subscription_id = X`

### 5.3 Trends

Purpose: **How has this changed over time?**

Primary visual:

- x-axis = months;
- one selected super-category = one stacked bar per month;
- bar height = actual value;
- stack segments = categories within that super-category;
- target overlay = the target recorded for that month.

For multiple selected super-categories:

- use grouped stacked bars;
- one bar per selected super-category per month;
- each bar remains stacked by its categories;
- each super-category retains its own target.

For one selected category:

- remove stacking;
- show the category total per month.

Selecting a bar/segment opens Explorer with the matching filters.

### 5.4 Subscriptions

Purpose: **What recurring commitments exist and what do they cost over time?**

Each subscription stores:

- merchant/name;
- billing amount;
- billing currency;
- billing interval in months/days where known;
- last payment;
- expected next renewal;
- confidence: detected / confirmed / manual;
- renewal intent: committed / likely / unknown / not renewing;
- monthly equivalent;
- optional reserve target.

Arbitrary intervals must be supported, including 3, 6, 12 and 24 months.

A $200 24-month subscription has a monthly equivalent of `$8.33/month` before FX conversion.

**Beta rule:** subscription monthly equivalents are informational. They do not create synthetic monthly spending transactions and do not silently alter Home budget actuals.

Optional saving/provision calculations can tell the user how much to set aside, but booking that reserve into the main budget is deferred until its semantics are intentionally designed.

### 5.5 Settings / Classification

Contains:

- Monzo connection state;
- sync controls;
- super-category settings;
- category list;
- category → super-category mapping;
- merchant rules;
- transaction-type rules;
- default monthly allocation;
- budget-scope defaults;
- data export/delete controls.

### 5.6 Experimental: Money Map

A Sankey-style view of budget base → super-categories → categories.

It is not primary navigation in the initial beta. It should be promoted only if actual usage shows it answers a useful question better than Home/Trends.

---

## 6. Runover visual

A defining visual behaviour.

For a super-category with target `T` and actual `A`:

- one full line represents exactly `T`;
- line 1 represents 0–100% of target;
- if `A > T`, expenditure wraps onto line 2;
- each additional full line represents another 100% of the target;
- partial final line represents the remaining fraction.

Example: target £600, actual £1,430.

```text
100%  ████████████████████████████
200%  ████████████████████████████
238%  ████████████░░░░░░░░░░░░░░░
```

Visual rules:

- first line uses the super-category colour;
- all runover lines after 100% use an over-budget/red scale;
- exact `actual`, `target`, `% used`, and `£ over/left` are always printed;
- the scale never rescales to make a huge overspend fit in one line;
- card height is allowed to grow with overspend.

Performance rule:

- for extreme values, preserve proportional scroll length but virtualise row rendering;
- do not create tens of thousands of live DOM/native nodes;
- £100,000 against a £600 target should still feel physically huge (~167 budget lengths), while remaining performant.

---

## 7. Calendar heat map

Purpose: show **when budget-included spending happens**.

Default daily amount:

```text
Living included spending
+ Fun included spending
```

Saving contributions, income, internal transfers and excluded transactions are not included in the default heat map.

Reference points:

```text
monthly spendable budget = Living target + Fun target
daily allowance = monthly spendable budget / days in month
```

Colour mapping:

- £0 = neutral;
- > £0 and < daily allowance = continuously increasing green;
- exactly daily allowance = darkest green;
- > daily allowance = red;
- red intensity increases continuously between the daily allowance and the full monthly spendable budget;
- >= full monthly spendable budget in one day = darkest red.

Tap/click a day:

1. navigate to Explorer;
2. apply exact-date filter;
3. show day summary, category/super-category split and transactions.

The calendar can be expanded in-place on Home. There is no dedicated Calendar page in beta.

---

## 8. Search

Search lives inside Explorer.

No LLM is required.

The app supports deterministic parsing of useful forms such as:

```text
coffee
coffee this month
coffee last 6 months
amazon 2026
over £100
under £10
fun over £50
restaurants august
subscriptions
weekends
saturday
```

Every recognised query is converted into visible filters.

Example:

```text
fun over £50 last 6 months
```

becomes:

```text
[Fun] [Amount > £50] [Last 6 months]
```

If a token is not understood, the app must not silently invent meaning.

---

## 9. Subscriptions

Recurring-payment detection may use deterministic heuristics:

- same/similar merchant;
- similar amount;
- repeated intervals;
- confirmed past classification.

Detection suggests; it does not silently assert.

A subscription can be:
- monthly;
- every N months;
- yearly;
- every N years;
- custom interval.

For a known future renewal, the app can calculate:

```text
monthly equivalent = amount / interval_months
```

and optionally:

```text
required reserve per month =
(max(renewal_amount - current_reserved_amount, 0)) / months_until_renewal
```

No synthetic expenses are created from these calculations in beta.

---

## 10. User control and correction

The user must always be able to:

- change transaction type;
- change category;
- change super-category through category mapping;
- include/exclude a transaction from monthly budget calculations;
- split a transaction;
- create a future merchant rule;
- delete/disable a rule;
- undo the latest classification change.

User-specific rules override imported Monzo categories.

---

## 11. Historical integrity

Each month stores:

- budget base;
- allocation percentages;
- derived £ targets;
- user overrides made during that month.

When the user changes the default allocation later, closed months retain their original targets.

Transaction reclassification can legitimately change historical actuals because the underlying interpretation has changed. The UI should record `updated_at` for auditability.

---

## 12. Privacy

Target architecture is local-first:

- transaction database stored locally;
- categories/rules stored locally;
- analytics computed locally;
- no embedded generative AI;
- no third-party analytics SDK required for beta.

Monzo authentication/sync may require a narrowly scoped companion service depending on the chosen OAuth approach. See `MONZO_INTEGRATION.md`.

---

## 13. Success criteria

The beta succeeds if the user can:

- understand the current month's Living / Saving / Fun position in under 10 seconds;
- trace any displayed number to the underlying transactions;
- correct a wrong classification in a few taps;
- inspect any category over time;
- identify spending-heavy days visually;
- distinguish a savings contribution from actual spending;
- distinguish a savings withdrawal from actual income;
- see subscription commitments without maintaining a separate spreadsheet.
