# Data Model

Technology-neutral logical schema. SQLite is the expected local persistence layer for a mobile beta.

## 1. `raw_transactions`

Immutable-ish imported records.

```text
id                    local UUID
source                "monzo"
source_transaction_id unique source ID
source_account_id
amount_minor          signed integer
currency
description
merchant_id
merchant_name
source_category
created_at
settled_at
raw_payload_json
first_seen_at
last_synced_at
source_deleted        boolean
```

Unique constraint:

```text
(source, source_transaction_id)
```

## 2. `transaction_classifications`

```text
id
raw_transaction_id
event_type
budget_scope          INCLUDED | EXCLUDED
category_id nullable
classification_source MANUAL | RULE | SUBSCRIPTION | TRANSFER_RULE | IMPORT_HINT | DEFAULT
confidence
counts_toward_budget_base boolean
note nullable
created_at
updated_at
```

Only one active top-level classification per unsplit raw transaction.

## 3. `transaction_splits`

```text
id
raw_transaction_id
amount_minor_abs
event_type
budget_scope
category_id
classification_source
note
created_at
updated_at
```

Invariant:
sum split amounts = absolute raw amount.

## 4. `super_categories`

```text
id
key       LIVING | SAVING | FUN
name
sort_order
active
```

Beta ships with exactly three primary super-categories, but schema should not hard-code enum-only presentation forever.

## 5. `categories`

```text
id
name
super_category_id
icon nullable
default_budget_scope
active
sort_order
created_at
updated_at
```

Example categories:

Living:
- Rent
- Bills
- Groceries
- Transport
- Subscriptions

Saving:
- House
- Investments
- Holiday saving
- Emergency fund

Fun:
- Coffee
- Shopping
- Restaurants
- Nights out
- Cinema

Exact seed list is user-editable.

## 6. `classification_rules`

```text
id
priority
enabled
match_type          merchant_id | merchant_name | description_regex | account | counterparty
match_value
result_event_type
result_category_id nullable
result_budget_scope nullable
created_at
updated_at
```

Rules must be deterministic and inspectable.

## 7. `monthly_budgets`

```text
month_key           YYYY-MM primary key
budget_base_minor
budget_base_mode    AUTO | MANUAL
living_ratio_bp     basis points
saving_ratio_bp
fun_ratio_bp
living_target_minor
saving_target_minor
fun_target_minor
created_at
updated_at
closed_at nullable
```

Ratios total 10,000 basis points.

Store derived target amounts to preserve historical intent even if calculation code changes.

## 8. `income_adjustments`

Optional explicit additions/subtractions to budget base.

```text
id
month_key
amount_minor_signed
reason
created_at
```

## 9. `subscriptions`

```text
id
name
merchant_match nullable
billing_amount_minor
billing_currency
interval_months nullable
interval_days nullable
last_payment_date nullable
next_expected_date nullable
detection_state DETECTED | CONFIRMED | MANUAL
renewal_intent COMMITTED | LIKELY | UNKNOWN | NOT_RENEWING
category_id
active
created_at
updated_at
```

Exactly one of interval_months/interval_days should normally be populated.

## 10. `subscription_reserve_plans`

Informational beta model.

```text
id
subscription_id
target_amount_minor
target_currency
reserved_amount_minor
target_date
enabled
created_at
updated_at
```

This table does not create synthetic spend transactions.

## 11. `sync_state`

```text
source
account_id
last_successful_sync_at
latest_seen_transaction_time
initial_history_complete
auth_state
last_error nullable
```

## 12. Suggested indexes

- raw_transactions(created_at)
- raw_transactions(merchant_id)
- raw_transactions(description)
- transaction_classifications(event_type)
- transaction_classifications(category_id)
- categories(super_category_id)
- classification_rules(priority, enabled)
- subscriptions(next_expected_date)

## 13. Derived query views

Recommended views/materialised query functions:

```text
v_effective_transactions
v_monthly_super_category_actuals
v_monthly_category_actuals
v_daily_included_spend
v_monthly_saving_metrics
v_subscription_monthly_equivalent
```

### `v_monthly_saving_metrics`

Must expose separately:

```text
saving_contributions
saving_withdrawals
net_savings_movement
saving_target
saving_target_progress
```

Never collapse these into one ambiguous figure.
