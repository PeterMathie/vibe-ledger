# Data Model

Technology-neutral logical schema. An encrypted SQLite implementation is planned for the local-first mobile V1; see [Local Data Architecture](06-engineering/LOCAL_DATA_ARCHITECTURE.md).

**V1 migration notice:** The older sections below record the current calendar-month and unrestricted-category schema. They must be migrated to the period-keyed and source-mapped entities specified in **Section 14** before the Settings and custom-period functionality is implemented. The [Budget Periods Domain Contract](02-product/BUDGET_PERIODS.md) owns date arithmetic and history preservation. This file remains the owner of logical persistence structure; legacy `monthly_budgets` and `month_key` are not future implementation requirements.

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

## 14. Required V1 schema evolution

The tables above are a starting schema, **not a second calendar-month authority**. Implement the following migration together with the [local ingestion pipeline](06-engineering/LOCAL_DATA_ARCHITECTURE.md) and the [budget-period semantics](02-product/BUDGET_PERIODS.md):

### 14.1 Source accounts, pots and sync coverage

```text
source_accounts:
  (source, source_account_id) unique
  description, account_type nullable, first_seen_at, last_seen_at

source_pots:
  (source, source_account_id, source_pot_id) unique
  name, style nullable, latest_balance_minor nullable, currency,
  latest_balance_observed_at nullable, deleted_flag nullable

sync_state per source/account:
  initial_history_complete, oldest_covered_at nullable,
  latest_seen_transaction_time nullable, last_successful_sync_at nullable,
  last_attempt_at nullable, last_error_code nullable,
  incremental_cursor nullable, coverage_status
```

Importing every permitted Monzo account **does not** mean each pot has a separate fully accessible transaction history.

### 14.2 Source category identity and user mapping

Retain the source category key independent of display names and visual identity. Extend `categories` with:

```text
source             nullable (e.g. "monzo" for directly imported keys)
source_key         nullable (e.g. "eating_out")
display_name       read-only for source-derived category, app-owned otherwise
icon               nullable app-owned value
gradient_start     nullable validated colour
gradient_end       nullable validated colour
super_category_id  nullable (null = Unassigned)
```

Add a unique identity constraint for `(source, source_key)` when source-driven, and a separate stable ID for app-defined categories used by explicitly classified Saving/pot transfers. The UI game should expose assignable identities, **not assert that Monzo supplies user-defined Saving categories**.

Reclassification/assignment operations should be reversible within the Settings editing session without rewriting imported source category keys.

### 14.3 Period-keyed budget storage

Replace the calendar-month-only key with:

```text
budget_period_rules:
  id, start_day (integer 1..31), effective_from, created_at

budget_periods:
  id, rule_id, start_date, end_exclusive_date,
  budget_base_minor, budget_base_mode,
  living_ratio_bp, saving_ratio_bp, fun_ratio_bp,
  living_target_minor, saving_target_minor, fun_target_minor,
  created_at, updated_at, closed_at nullable

income_adjustments:
  id, budget_period_id, amount_minor_signed, reason, created_at
```

Period start/end use **date-only** values in the user's chosen financial time zone. No two authoritative active periods overlap. Historical periods retain their allocations; the explicit transition policy when changing start day mid-period must be resolved before shipping.

### 14.4 Theme preference

```text
app_preferences:
  theme_preset_id
  financial_timezone
  configured_at / updated_at
```

V1 stores a selected predefined theme identifier, not a collection of arbitrary app-wide RGB sliders. Category gradient endpoints remain separately app-owned.

### 14.5 Source records, indexes, retention

- Preserve the original immutable-ish `raw_transactions` table and separately owned classification/split tables.
- Store account-scoped transaction keys with unique `(source, source_transaction_id)` and indexing by source account and created timestamp; retain source amounts in integer minor units and UTC timestamps.
- Keep only the source payload needed for safe reclassification/debugging, encrypted at rest; do not retain unneeded PII or secrets in a raw JSON dump by default.
- Index `(source, source_account_id, created_at)`, effective category/type/scope, period start/end and search fields.
- Model sync coverage and local deletes separately from user transaction exclusions; a failed fetch is **not** a source deletion.

### 14.6 Reactive read models

Future logical queries replace `v_monthly_*` names with period-aware equivalents. Centralise effective-event classification and use shared daily aggregates for Trends, Home and Breakdown; **do not let each page interpret debit/credit signs itself**.

**Migration acceptance criteria**
1. Existing monthly sample data is migrated or clearly invalidated in a reversible local migration; raw IDs/user overrides survive.
2. Period boundaries and category gradients survive app restart/resync.
3. Source category reassignment updates affected historical views without changing raw source records.
4. All signed monetary values remain exact integer minor units; unsupported currency mixing is rejected or reported.
5. Database migrations and downgrade/recovery are tested using encrypted fixtures.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [AGENTS.md](<../AGENTS.md>)
- [README.md](<../README.md>)
- [docs/00-workflow/AI_WORKFLOW.md](<00-workflow/AI_WORKFLOW.md>)
- [docs/02-product/BUDGET_PERIODS.md](<02-product/BUDGET_PERIODS.md>)
- [docs/05-pages/breakdown/FUNCTIONAL.md](<05-pages/breakdown/FUNCTIONAL.md>)
- [docs/05-pages/home/FUNCTIONAL.md](<05-pages/home/FUNCTIONAL.md>)
- [docs/05-pages/settings/FUNCTIONAL.md](<05-pages/settings/FUNCTIONAL.md>)
- [docs/06-engineering/LOCAL_DATA_ARCHITECTURE.md](<06-engineering/LOCAL_DATA_ARCHITECTURE.md>)
<!-- GENERATED: BACKLINKS END -->
