# Build Backlog

Ticket IDs are stable references for implementation agents.

## Epic A — Domain and persistence

### BL-001 — Money primitive
Implement integer-minor-unit money type with currency.

Acceptance:
- no binary floating-point arithmetic for money;
- addition/subtraction requires same currency;
- display formatting is locale-aware;
- tests include GBP and USD.

### BL-002 — Domain enums
Implement event types, budget scope, classification source and confidence.

Acceptance:
- matches `MONEY_MODEL.md`;
- serialisable to local DB;
- unknown future enum values fail safely.

### BL-003 — Local schema
Implement schema/migrations from `DATA_MODEL.md`.

Acceptance:
- fresh install works;
- migration tests exist;
- unique source transaction constraint enforced.

### BL-004 — Fixture importer
Load synthetic raw bank events from `/fixtures`.

Acceptance:
- idempotent import;
- no classification side effects inside importer.

## Epic B — Classification engine

### BL-005 — Effective classification
Resolve one effective classification per raw event.

Precedence:
manual > rule > subscription > transfer rule > import hint > default.

### BL-006 — Manual reclassification
Allow user override of type/category/scope.

Acceptance:
- recalculates affected aggregates immediately;
- preserves raw event;
- stores audit timestamps.

### BL-007 — Merchant rules
Create/edit/disable deterministic merchant rules.

Acceptance:
- user can apply future-only rule;
- existing manual overrides are never overwritten.

### BL-008 — Split transactions
Support category/type/scope splits.

Acceptance:
- split amounts sum exactly to raw amount;
- UI blocks invalid remainder;
- aggregates use splits instead of parent classification.

### BL-009 — Needs Review
Surface low-confidence/unclassified events.

Acceptance:
- does not block dashboard;
- review queue filter exists.

## Epic C — Budget engine

### BL-010 — Budget base
Calculate month budget base from eligible Income + manual adjustment.

Acceptance:
- saving withdrawals do not count;
- reimbursements/refunds do not count by default.

### BL-011 — Monthly allocation
Implement monthly ratios and £ targets.

Acceptance:
- ratios total 100%;
- current month editable;
- historical months retain stored targets.

### BL-012 — Living/Fun actuals
Aggregate included Spend by super-category.

### BL-013 — Saving metrics
Expose:
- contributions;
- withdrawals;
- target progress;
- net savings movement.

Acceptance:
- B4/B5 scenarios pass exactly.

### BL-014 — Refund/reimbursement offsets
Implement category offsets and optional original-transaction linking.

## Epic D — Home

### BL-015 — Allocation control
Interactive 3-way allocation UI.

Acceptance:
- drag + numeric alternative;
- live £ target updates;
- reset to default;
- accessible without drag.

### BL-016 — Super-category status cards
Show target, actual, remaining/over, percentage.

Saving card uses contribution semantics plus net movement.

### BL-017 — Wrapping runover bar
Implement one line per 100% target.

Acceptance:
- G1–G4;
- huge values retain proportional scroll height;
- row rendering virtualised beyond a sensible threshold;
- exact amount remains visible.

### BL-018 — Heat map
Implement calendar heat map from included Living + Fun spend.

Acceptance:
- H1–H6;
- continuous colour scale;
- day tap deep-links to Explorer.

## Epic E — Explorer

### BL-019 — Explorer shell
Filtered summary + category breakdown + transaction list.

### BL-020 — Deep-link filter contract
Support navigation payloads:
- exact date;
- month;
- super-category;
- category;
- merchant;
- subscription.

### BL-021 — Transaction editor
Category/type/scope/split/rule controls.

### BL-022 — Structured filters
UI filters for period, category, super-category, merchant, amount, event type and subscription status.

### BL-023 — Deterministic search parser
Parse supported phrases into visible filter chips.

Acceptance:
- J1–J3;
- no opaque/invented semantics.

## Epic F — Trends

### BL-024 — Single-super-category stacked chart
Monthly stacked bars + stored target overlay.

### BL-025 — Multi-super-category chart
Grouped stacked bars.

### BL-026 — Single-category trend
Unstacked category series.

### BL-027 — Trends → Explorer
Chart selection deep-links with exact filters.

## Epic G — Subscriptions

### BL-028 — Subscription CRUD
Manual create/edit/disable.

### BL-029 — Monthly equivalent
Calculate arbitrary billing interval equivalents.

### BL-030 — Recurrence detector
Suggest likely recurring charges using deterministic merchant/amount/interval heuristics.

Acceptance:
- suggestion only;
- user confirmation required.

### BL-031 — Renewal intent
Committed / likely / unknown / not renewing.

### BL-032 — Optional reserve calculator
Calculate required monthly reserve without creating synthetic spending.

## Epic H — Monzo

### BL-033 — Monzo raw adapter
Map source payloads into raw transaction schema.

Acceptance:
- domain engine has no Monzo-specific dependency.

### BL-034 — Auth spike
Prototype strict-local and thin-broker OAuth approaches.

Deliverable:
- short decision record with security/UX trade-off;
- no production auth implementation until decision is made.

### BL-035 — Initial history sync
Import historical transactions immediately after auth.

### BL-036 — Incremental sync
Idempotent upsert and sync cursor/state.

### BL-037 — Pot metadata
Import pot identity/balance metadata where available without assuming semantic meaning.

## Epic I — Experimental

### BL-038 — Money Map
Sankey-like visual based on existing aggregates.

Acceptance:
- hidden/experimental entry;
- no new accounting semantics introduced.

## Epic J — Quality

### BL-039 — Acceptance suite
Turn `ACCEPTANCE_SCENARIOS.md` into automated tests.

### BL-040 — Data export/wipe
Export local classifications and wipe local data.

### BL-041 — Offline behaviour
All analytics work from local DB while offline.

### BL-042 — Accessibility pass
Keyboard/screen-reader/touch target/colour-independence checks.

## Build order

Recommended critical path:

```text
001 → 004
005 → 014
039
019 → 023
015 → 018
024 → 027
028 → 032
034
033 → 037
038
040 → 042
```

The Monzo integration deliberately comes after the semantic engine and fixture-driven app.
