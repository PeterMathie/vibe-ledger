# Acceptance Scenarios

These scenarios are executable product truth. They should become automated tests wherever possible.

Assume unless stated otherwise:

```text
Budget base = £3,000
Living = 50% = £1,500
Saving = 30% = £900
Fun = 20% = £600
```

## A. Ordinary spending

### A1. Coffee

Event: £4.20 coffee.

Expected:
- type: SPEND
- category: Coffee
- super-category: Fun
- Fun actual +£4.20
- heat-map day +£4.20
- no effect on income or Saving.

### A2. Rent

Event: £900 rent.

Expected:
- type: SPEND
- category: Rent
- Living actual +£900.

### A3. Grocery + fun split

Event: £70 Tesco split into £55 Groceries and £15 party supplies.

Expected:
- Living +£55
- Fun +£15
- heat map +£70
- one raw transaction, two split records.

---

## B. Saving

### B1. Monzo pot deposit

Event: £200 current account → House pot.

Expected:
- SAVING_CONTRIBUTION
- category: House saving
- Saving target progress +£200
- spending +£0
- heat map +£0.

### B2. Moneybox ISA transfer

Event: £200 current account → Moneybox ISA.

Expected:
- same budget effect as B1;
- category may be Investments;
- Saving target progress +£200.

### B3. Savings withdrawal

Event: £6,000 savings → current account.

Expected:
- SAVING_WITHDRAWAL
- Income +£0
- Living/Fun spending +£0
- net savings movement -£6,000
- budget base unchanged.

### B4. Save then withdraw in same month

Events:
- +£900 saving contribution;
- -£900 saving withdrawal.

Expected:
- Saving target progress = £900 / £900;
- net savings movement = £0;
- no fake income;
- no fake spending.

### B5. Save £900, withdraw £5,000

Expected:
- Saving target progress = 100%;
- net savings movement = -£4,100;
- Home shows both without merging them into one number.

---

## C. Internal transfers

### C1. Current account A → current account B

Expected:
- INTERNAL_TRANSFER
- no budget effect.

### C2. Transfer is misdetected as spend

User changes type to INTERNAL_TRANSFER and creates rule.

Expected:
- current month recalculates immediately;
- future matching transfers follow rule;
- historical raw data unchanged.

---

## D. Income

### D1. Salary

Event: +£3,000 salary.

Expected:
- INCOME
- counts toward budget base;
- targets calculated from £3,000.

### D2. Savings withdrawal looks like incoming bank credit

Event: +£6,000 from known savings source.

Expected:
- SAVING_WITHDRAWAL
- does not increase budget base.

### D3. Genuine one-off income

Event: +£500 sale/payment manually marked Income.

Expected:
- user can choose whether it contributes to budget base;
- if yes, allocation targets update for current month.

---

## E. Refunds and reimbursements

### E1. Same-month clothing refund

Spend £120 Shopping, then receive £120 refund.

Expected:
- net Fun Shopping impact £0 if linked;
- refund is not ordinary income.

### E2. Friend reimburses dinner

Spend £80 restaurant; friend sends £40 reimbursement linked to transaction.

Expected:
- net Fun restaurant cost £40.

---

## F. Exclusion

### F1. Holiday purchase deliberately outside monthly budget

Event: £700 hotel, user chooses EXCLUDED.

Expected:
- still visible in Explorer;
- searchable as Holiday;
- does not affect Home Living/Fun gauges;
- does not affect default heat map;
- does not affect default Trends actuals.

### F2. Similar coffee on holiday still paid from monthly allowance

Event: £4 coffee, user keeps INCLUDED and category Coffee → Fun.

Expected:
- Fun +£4;
- no dependency on which pot/account previously held the money.

This explicitly avoids trying to infer "funding provenance."

---

## G. Runover visual

### G1. Under target

Fun target £600, actual £300.

Expected:
- one line at 50%;
- £300 left.

### G2. Slightly over

Fun target £600, actual £684.

Expected:
- line 1 full;
- line 2 = 14%;
- £84 over;
- second line visually red.

### G3. 238% used

Target £600, actual £1,430.

Expected:
- two full lines;
- third line ≈38.3%.

### G4. Extreme overspend

Target £600, actual £100,000.

Expected:
- approximately 166 full budget lengths plus partial final length;
- scrollable/proportionally tall representation;
- virtualised rendering if needed;
- no rescaling to a single compact bar.

---

## H. Heat map

### H1. No spending

Expected: neutral cell.

### H2. Below daily allowance

Spend below `(Living target + Fun target) / days_in_month`.

Expected: green; intensity rises continuously with amount.

### H3. Exactly daily allowance

Expected: darkest green.

### H4. Above daily allowance

Expected: red; intensity rises continuously until capped at full monthly spendable budget.

### H5. Saving contribution day

Only event = £900 savings contribution.

Expected:
- heat-map spend = £0;
- cell does not become red.

### H6. Click day

Expected:
- Explorer opens with exact date filter;
- summary and transaction list match that date.

---

## I. Trends

### I1. Single super-category

Select Fun over 12 months.

Expected:
- one stacked bar per month;
- stack = Fun subcategories;
- each month uses its own stored target.

### I2. Single category

Select Coffee.

Expected:
- one unstacked value per month;
- click opens Explorer filtered to month + Coffee.

### I3. Multiple super-categories

Select Living + Fun.

Expected:
- grouped stacked bars;
- not one merged bar;
- each super-category remains independently understandable.

---

## J. Search

### J1. Exact merchant

Query `Tesco`.

Expected: matching merchant/description results.

### J2. Compound deterministic query

Query `fun over £50 last 6 months`.

Expected visible filters:
- Super-category = Fun
- Amount > £50
- Date = last 6 months

### J3. Unrecognised phrase

Expected:
- do not fabricate meaning;
- retain recognised tokens only or show "not understood";
- filters remain visible.

---

## K. Subscriptions

### K1. £90 annual subscription

Expected:
- interval 12 months;
- monthly equivalent £7.50.

### K2. $200 / 24 months

Expected:
- monthly equivalent $8.33 (rounded display; exact internal decimal retained);
- no synthetic monthly spending entry.

### K3. Uncertain renewal

User marks Piano subscription "likely" or "unknown".

Expected:
- remains tracked;
- no automatic reserve transaction created.

### K4. Optional reserve calculation

£90 renewal due in 6 months, £30 already reserved.

Expected suggested reserve:
- (£90 - £30) / 6 = £10/month.

---

## L. Historical integrity

### L1. Allocation changes next month

September 50/30/20.
October changed to 50/25/25.

Expected:
- September target lines remain 50/30/20;
- October uses 50/25/25.

### L2. Historical reclassification

September transaction changed from Shopping → Groceries in November.

Expected:
- September actuals recalculate;
- September target remains unchanged;
- classification `updated_at` changes.
