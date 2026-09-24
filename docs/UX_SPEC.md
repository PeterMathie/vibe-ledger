# UX Specification

## 1. Design principles

- Dense enough to be useful; not finance-dashboard clutter.
- Numbers first, decoration second.
- Red only means the user has crossed a meaningful target.
- Every aggregate must be traceable to transactions.
- Do not hide logic behind unexplained exclusions.
- Avoid modal-heavy flows.
- Mobile-first.
- Dark/light theme can follow system; colour semantics must survive both.
- Accessibility: do not rely on colour alone for over/under state.

---

## 2. Home

### 2.1 Header

Show:
- active month;
- budget base;
- sync freshness/status.

### 2.2 Allocation control

Preferred visual: draggable donut/ring with three segments.

Requirements:
- Living / Saving / Fun;
- percentages displayed explicitly;
- £ target displayed explicitly;
- total locked to 100%;
- drag boundaries;
- tap to enter exact percentage;
- Reset to default allocation;
- changes affect current month only unless user chooses "set as future default."

### 2.3 Super-category cards

Living:
```text
£1,284 / £1,500
£216 left
85.6%
```

Fun:
```text
£684 / £600
£84 over
114%
```

Saving:
```text
£720 contributed / £900 target
£180 to go
Net savings movement: -£430
```

### 2.4 Runover

See Product Spec.

Tap card/runover:
- Explorer filtered to current month + super-category.

### 2.5 Heat map

Calendar month grid.

Must:
- show date number;
- use continuous neutral→green→red scale;
- provide legend;
- tap any day;
- expand calendar in-place for more detail.

Tap:
- Explorer exact-date filter.

---

## 3. Explorer

Explorer is the central detail screen.

### 3.1 Header summary

For active filters:
- total included spend;
- total excluded spend if non-zero;
- transaction count;
- selected period;
- selected category/super-category if applicable.

For exact-day drill-down:
- total;
- % of monthly spendable budget;
- Living/Fun split;
- category split.

### 3.2 Breakdown visual

Use a simple proportion/list visual, not an unnecessary pie if labels become hard to read.

Each category row:
- name;
- amount;
- percentage of current filtered total;
- expandable merchant/transaction children where useful.

### 3.3 Transaction list

Each row:
- date/time;
- merchant/description;
- amount;
- category;
- super-category indicator;
- type indicator if not ordinary Spend;
- excluded badge if excluded.

### 3.4 Transaction editor

Actions:
- category;
- event type;
- budget scope include/exclude;
- split;
- note;
- remember rule;
- undo.

Avoid exposing accounting jargon unless necessary. Suggested user-facing type labels:

```text
Purchase
Income
Put into savings
Taken from savings
Transfer between my accounts
Refund
Reimbursement
Credit-card payment
Ignore / neutral
```

---

## 4. Trends

### 4.1 Filter bar

Controls:
- period: 3 / 6 / 12 / 24 months / custom;
- super-category multiselect;
- category selector;
- include excluded toggle (advanced; default off).

### 4.2 Chart rules

One super-category:
- stacked bar per month;
- stack = categories;
- target overlay for each month.

Multiple super-categories:
- grouped stacked bars.

One category:
- single series per month.

Tap chart segment:
- open Explorer with exact filters.

### 4.3 Detail panel

Selecting a month displays:
- actual;
- target where relevant;
- over/under;
- category composition;
- matching transactions.

---

## 5. Subscriptions

### 5.1 Summary

Show:
- confirmed monthly subscriptions;
- long-interval monthly equivalent;
- total monthly equivalent;
- renewals in next 30 / 90 days.

### 5.2 Subscription card

Show:
- name;
- last amount;
- billing interval;
- monthly equivalent;
- next expected renewal;
- renewal intent;
- reserve-plan status if enabled.

### 5.3 Subscription editing

User can:
- confirm/deny detection;
- set interval;
- set next expected date;
- set renewal intent;
- set optional reserve amount;
- stop tracking.

No forced sinking fund.

---

## 6. Search

Single field on Explorer.

When parser recognises tokens, create removable chips.

Examples:

```text
coffee last 6 months
→ [Coffee] [Last 6 months]

fun over £50
→ [Fun] [Amount > £50]
```

Never hide the interpreted query.

---

## 7. Empty / edge states

### No transactions yet
Explain sync requirement and show one clear action.

### Unclassified transactions
Show "Needs review" count, but do not block the dashboard.

### Target = £0
Do not divide by zero.
Show actual amount and "No target set."

### Negative category actual from refunds
Allow it; label clearly.

### Huge runover
Virtualise.

### Offline
Continue to show all local data with last sync timestamp.

---

## 8. Motion

Minimal.
- allocation drag updates numbers live;
- runover can add rows without celebratory/confetti animation;
- no pulsing red alarms;
- respect reduced-motion preference.
