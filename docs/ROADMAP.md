# Roadmap

## Phase 0 — semantic engine

Goal: prove the money model before polishing UI.

Deliver:
- local database;
- raw transaction fixture importer;
- classification engine;
- categories/super-categories;
- monthly budget calculations;
- saving contribution/withdrawal metrics;
- exclusion logic;
- automated tests from `ACCEPTANCE_SCENARIOS.md`.

Exit criterion:
All normative money-model scenarios pass against synthetic fixtures.

## Phase 1 — local app with fake data

Deliver:
- Home;
- allocation editor;
- runover visual;
- heat map;
- Explorer;
- manual reclassification;
- splits;
- Trends;
- deep-link/filter navigation.

Use seeded realistic data before touching live Monzo.

Exit criterion:
The app can be evaluated end-to-end without a bank connection.

## Phase 2 — Monzo read integration

Deliver:
- OAuth/auth prototype;
- initial import;
- incremental sync;
- raw-source adapter;
- merchant/category hints;
- pot metadata where useful;
- sync state UI.

Exit criterion:
Imported Monzo data produces the same model behaviour as fixtures.

## Phase 3 — rules and search

Deliver:
- merchant rules;
- deterministic transfer rules;
- "Needs review";
- search parser;
- filter chips;
- rule management.

## Phase 4 — subscriptions

Deliver:
- manual subscription records;
- deterministic recurring detection;
- arbitrary billing interval;
- monthly equivalent;
- renewal intent;
- renewal calendar/list;
- optional reserve calculation.

## Phase 5 — experimental views

Deliver:
- Money Map.

Evaluate whether it earns a permanent dashboard position.

## Later / explicit stretch

- milestones/gamification;
- richer recurring-cost predictions;
- more natural query language without an LLM;
- multi-bank / credit-card transaction import;
- proper card purchase + repayment reconciliation;
- optional notification system;
- user-defined additional super-categories if real usage demands it.

## Deliberately not planned until evidence exists

- AI assistant;
- automatic "financial health" scores;
- automated pot-purpose alignment;
- funding-source provenance;
- investment portfolio performance;
- social features.
