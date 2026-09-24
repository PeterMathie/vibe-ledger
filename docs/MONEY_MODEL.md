# Money Model

This document is normative. If UI copy, imported bank fields or implementation shortcuts conflict with this model, this model wins.

## 1. Four independent concepts

Every imported bank event has four separate concepts.

### 1.1 Raw event

What the bank says happened.

Examples:

- amount `-20000` pence;
- description `MONEYBOX`;
- timestamp;
- Monzo category;
- merchant ID;
- account/pot IDs.

Raw events are immutable after import except for sync reconciliation.

### 1.2 Event type

What happened financially in Vibe Ledger.

Canonical beta types:

```text
INCOME
SPEND
SAVING_CONTRIBUTION
SAVING_WITHDRAWAL
INTERNAL_TRANSFER
REFUND
REIMBURSEMENT
DEBT_PAYMENT
NEUTRAL
```

`NEUTRAL` is the semantic result of a bank event that should not affect budget calculations.

### 1.3 Category / super-category

What the event is for.

Examples:

```text
Coffee → Fun
Rent → Living
Investments → Saving
House saving → Saving
Subscriptions → Living
```

A transaction type and category are not interchangeable.

Example:

```text
Moneybox £200
type = SAVING_CONTRIBUTION
category = Investments
super_category = Saving
```

### 1.4 Budget scope

Whether the event participates in monthly budget calculations.

```text
INCLUDED
EXCLUDED
```

Type provides a default scope. The user may override scope per event.

This is intentionally explicit so the app never has hidden "some categories are mysteriously excluded" behaviour.

---

## 2. Derived monthly quantities

For month `m`:

### 2.1 Budget base

```text
budget_base(m)
= sum(INCOME events where counts_toward_budget_base = true)
  + manual adjustment
```

Savings withdrawals never count as income by default.

### 2.2 Targets

If allocation ratios are:

```text
Living = L%
Saving = S%
Fun    = F%
```

then:

```text
living_target = budget_base × L
saving_target = budget_base × S
fun_target    = budget_base × F
```

with:

```text
L + S + F = 100%
```

### 2.3 Living actual

```text
living_actual
= sum(included SPEND amounts whose category.super_category = Living)
  - linked/reflected refunds for Living
  - linked reimbursements that offset Living spend
```

### 2.4 Fun actual

Equivalent to Living, for Fun.

### 2.5 Saving target progress

```text
saving_contributed
= sum(included SAVING_CONTRIBUTION amounts)
```

Saving withdrawals do **not** erase the fact that current-month income was allocated to saving.

This is a deliberate product decision.

### 2.6 Net savings movement

```text
net_savings_movement
= SAVING_CONTRIBUTION
  - SAVING_WITHDRAWAL
```

This appears as a secondary metric so the user can see whether savings actually rose or fell.

### 2.7 Total included spending

```text
included_spending = living_actual + fun_actual
```

Saving contributions are not "spending."

---

## 3. Why Saving has two numbers

Example:

```text
Budget base                  £3,000
Saving target                  £900

Contributed to savings         £900
Withdrawn from old savings   £5,000
```

The correct app representation is:

```text
Saving target progress      £900 / £900
Net savings movement        -£4,100
```

This avoids two bad interpretations:

- calling the £5,000 withdrawal income;
- pretending the user did not allocate £900 of current income to saving.

---

## 4. Exclusion

`EXCLUDED` means the event is visible but ignored by the primary monthly budget calculations.

Examples where the user may choose exclusion:

- a one-off holiday purchase intentionally outside the monthly Living/Fun budget;
- a pass-through payment;
- a bank correction;
- a transaction the user does not want influencing budget performance.

Excluded events:

- remain searchable;
- remain visible in Explorer;
- can appear in an "all transactions" view;
- do not affect Home gauges;
- do not affect the default heat map;
- do not affect default Trends actuals.

Explorer and Trends may later offer an "include excluded" toggle.

Category defaults may suggest an exclusion state, but per-event user choice wins.

---

## 5. Transfer handling

### 5.1 Current account → Monzo pot used for saving

```text
type = SAVING_CONTRIBUTION
category = user-selected saving category
super-category = Saving
```

### 5.2 Current account → Moneybox ISA

Same budget effect:

```text
type = SAVING_CONTRIBUTION
category = Investments
super-category = Saving
```

The fact that one transfer is internal to Monzo and the other leaves Monzo does not matter to the budget model.

### 5.3 Savings → current account

```text
type = SAVING_WITHDRAWAL
income effect = 0
spending effect = 0
net savings movement = negative
```

A later purchase is classified independently.

### 5.4 Current account A → current account B

If both are the user's ordinary cash accounts:

```text
type = INTERNAL_TRANSFER
budget effect = 0
```

### 5.5 Unknown outgoing transfer

Do not guess aggressively.

Initial classification can be `NEUTRAL` or "Needs review" if confidence is low.

---

## 6. Spend handling

A purchase is a `SPEND` event.

A spend event has:

- positive absolute display amount;
- category;
- super-category derived from category;
- budget scope;
- optional split children.

Raw bank amount may be negative. UI spending amounts are displayed as positive expenditure values.

---

## 7. Split transactions

A raw transaction may be split into multiple classification portions.

Invariant:

```text
sum(split portions) = absolute raw transaction amount
```

Example:

```text
Tesco £70
£55 Groceries → Living
£15 Alcohol/party supplies → Fun
```

Each split can have its own budget scope.

The raw transaction is retained as the parent record.

---

## 8. Refunds

Preferred behaviour:

- link refund to original spend when possible;
- refund reduces the actual of the original category/super-category;
- refund does not count as ordinary Income.

Example:

```text
August clothing purchase      £120 Fun
September return/refund       £120
```

If linked cross-month, September may show negative category activity. Trends should permit negative values or present "refunds" explicitly.

If linking is unavailable, user can assign the refund's category manually.

---

## 9. Reimbursements

A reimbursement from another person is not automatically salary/income.

If linked to a spend, it offsets that spend.

Example:

```text
Dinner paid by user     £80 Fun
Friend reimburses       £40
Net Fun cost            £40
```

If the user wants the incoming amount treated as income instead, manual override is allowed.

---

## 10. Credit-card payments

A credit-card repayment is not itself consumption if the underlying card purchases are already represented elsewhere.

Beta type:

```text
DEBT_PAYMENT
```

Default budget effect:

```text
spending = 0
income = 0
```

Known limitation:

If Vibe Ledger does not import the underlying credit-card purchases, spending analytics will be incomplete. The app must never pretend otherwise.

A future multi-account/Open Banking phase can import card purchases and keep repayments neutral.

---

## 11. Subscriptions

Subscription status is metadata over one or more spend transactions.

A £90 annual renewal is still a £90 spend when it actually occurs unless the user explicitly excludes it.

The monthly equivalent is an analytical value, not a synthetic transaction.

This prevents double counting and avoids accidental accrual-accounting complexity in beta.

---

## 12. Classification precedence

Highest to lowest:

1. manual per-transaction override;
2. explicit user rule;
3. confirmed subscription rule;
4. deterministic transfer/account rule;
5. imported Monzo category/merchant hint;
6. default category;
7. Needs Review.

A lower-precedence rule must never overwrite a higher-precedence user decision.

---

## 13. Confidence

Automatic classifications may store:

```text
HIGH
MEDIUM
LOW
MANUAL
```

Low-confidence items should be easy to review but must not block app use.

---

## 14. Invariants

The implementation must enforce:

- raw event identity is stable;
- raw event amount is never rewritten to "make budgeting work";
- every non-split event has at most one active classification;
- split portions sum exactly to the raw event amount;
- a savings withdrawal never increases income unless the user explicitly changes its type;
- a saving contribution never increases spending;
- internal transfers affect neither spending nor income;
- monthly allocation percentages total exactly 100%;
- historical month targets remain stable unless the user explicitly edits that historical month.
