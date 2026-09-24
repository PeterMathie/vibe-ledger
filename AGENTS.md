# AGENTS.md

## Mission

Build the beta described in `/docs`.

Do not add features because they seem conventional for finance apps. The product is intentionally narrow.

## Source-of-truth order

When requirements conflict:

1. `docs/MONEY_MODEL.md`
2. `docs/ACCEPTANCE_SCENARIOS.md`
3. `docs/PRODUCT_SPEC.md`
4. `docs/UX_SPEC.md`
5. `docs/DATA_MODEL.md`
6. implementation convenience

Do not change semantic rules merely to simplify UI code.

## Mandatory first milestone

Before live Monzo integration, implement the semantic engine using fixture data and make the acceptance scenarios testable.

The application must be able to explain why a raw event produced a given budget effect.

## Architecture requirements

- local-first;
- deterministic classification;
- no generative AI dependency;
- immutable raw-source records;
- app-owned classifications stored separately;
- SQLite or equivalent durable local relational storage;
- classification logic covered by tests;
- aggregation logic covered by tests;
- money stored in integer minor units;
- never use binary floating point for money;
- percentages may use basis points/decimal arithmetic;
- preserve source currencies;
- conversions, if later added, must preserve original amount/currency.

## UI requirements

- mobile-first;
- all aggregates drill to Explorer;
- red is reserved for target breach;
- colour is not the sole status signal;
- extreme runover must remain proportionally tall and performant;
- no fake AI/narrative copy;
- no hidden exclusion behaviour.

## Monzo requirements

Do not couple domain logic directly to Monzo response shapes.

Use:

```text
Monzo adapter
    ↓
raw transaction records
    ↓
classification engine
    ↓
budget domain model
    ↓
UI
```

The adapter may change without changing money semantics.

## Implementation ticket order

1. Domain types and money arithmetic.
2. Local schema/migrations.
3. Fixture importer.
4. Classification engine.
5. Monthly budget engine.
6. Acceptance scenario tests.
7. Explorer.
8. Home.
9. Heat map + deep links.
10. Trends.
11. Rule engine.
12. Search parser.
13. Subscription module.
14. Monzo adapter/auth.
15. Experimental Money Map.

## Pull request expectations

Every semantic change must:
- name the money-model rule being changed;
- update/add acceptance scenarios;
- include tests;
- avoid silently changing historical budget meaning.

## Do not implement yet

- AI;
- funding-source tracing;
- pot-purpose alignment;
- investment returns;
- a general ledger/accounting package;
- public multi-user infrastructure beyond what Monzo auth requires.
