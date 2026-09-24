# Foundation Architecture

## Scope

This foundation and first interactive layer implement the Phase 0 semantic
engine and fixture-backed Home/Explorer experience for the Expo app, targeting
Android and iOS from one TypeScript codebase. They deliberately do not implement
Monzo OAuth, live sync, search, transaction editing, subscription detection, or
a sync broker.

## Document ownership

Product and money semantics remain authoritative only in the precedence defined
by `AGENTS.md`. This document describes implementation boundaries and quality
gates; it does not redefine financial meaning. Security/privacy controls live
in `SECURITY_AND_PRIVACY.md`, dependency decisions in `THIRD_PARTY.md`, and
integration decisions in versioned ADRs.

## Module boundaries

```text
Expo React Native Home / Explorer
        |
        v
Pure view models (src/app/view-models.ts)
        |
        v
Runtime repository (src/data/demo-repository.ts)
        |
        +----> Pure TypeScript domain (src/domain)
        |
        v
Persistence ports (src/data/database.ts)
        |
        +-- Expo SQLite adapter (runtime)
        +-- Node SQLite adapter (integration tests only)
```

- `src/domain` has no React Native, Expo, SQLite, or Monzo imports.
- `src/data/migrations.ts` owns the durable relational schema.
- `src/data/fixture-importer.ts` imports immutable raw source rows only. It has
  no classification side effects.
- `src/data/classification-repository.ts` stores app-owned interpretations
  separately and retains inactive history.
- `src/data/expo-database.ts` is the only Expo SQLite adapter.
- `src/data/demo-repository.ts` owns deterministic demo bootstrap, reset,
  current-month allocation persistence, and parameterised typed queries. Demo
  ownership rows ensure reset cannot delete unrelated data.
- `src/domain/query.ts` is the canonical query contract shared by Home,
  Breakdown, Trends, and future Subscriptions. No UI value is interpolated
  into SQL.
- `src/domain/analytics.ts` defines the semantic Trend measures.
  `src/domain/trends.ts` aggregates monthly bars, category composition, stored
  targets, transaction counts, and canonical drill-down payloads without
  merging Living/Fun spending, Saving contributions, and net savings movement.
- `src/app/allocation.ts`, `src/app/heat-map.ts`, and `src/app/trends.ts` hold
  exact, React-free interaction math for the allocation ring, runover,
  calendar, period boundaries, and chart layout.
- `src/app/view-models.ts` converts semantic-engine output into Home and
  Explorer labels and typed drill-down filters without importing React Native.
- `src/app/startup.ts` is the composition boundary. It may depend on Expo and
  persistence, but domain modules must never depend on it.

## Startup readiness

The app is not ready merely because React Native rendered. Startup opens the
app-private SQLite database and applies every migration before showing the ready
state. Migration failure produces a generic local error state; it must not fall
back to an empty success-shaped database or print raw database content.

Future startup work must preserve this order:

1. open app-private storage;
2. apply migrations atomically;
3. validate required local state;
4. expose repositories/domain services;
5. render product screens.

## Money and allocation decisions

- Money is a safe integer minor-unit amount plus an ISO 4217 currency.
- Cross-currency arithmetic is rejected.
- Basis-point allocation uses integer `BigInt` intermediates. Whole minor units
  are assigned using largest remainder, with Living, Saving, Fun order as the
  deterministic tie-break.
- Raw signed amounts are preserved. Budget spend and saving measures use
  positive absolute source amounts, while refunds and reimbursements apply
  negative offsets.
- Monthly targets are stored values. Reclassification may alter historical
  actuals but never silently rewrites a stored target.

## Fixtures and tests

- `fixtures/semantic-fixtures.json` is the importer and core semantic set.
- `fixtures/boundary-fixtures.json` captures difficult, future-facing legal
  cases without enabling future features prematurely.
- Fixtures are deterministic, synthetic, and contain no credentials, tokens,
  account numbers, or real personal data.
- Fixture IDs and clocks are explicit. Tests must not depend on wall-clock time,
  random IDs, locale defaults, or execution order.
- The interactive demo includes ordinary spend, an included runover example, a split, saving contributions
  and withdrawal, internal transfer, linked refund and reimbursement, explicit
  exclusions, historical targets, low-confidence review, a large legal amount,
  and an annual subscription represented only as underlying spend metadata.
- Node's in-memory SQLite implementation is used only to execute real migration
  and importer SQL in tests. Android runtime persistence remains Expo SQLite.
- `npm test` explicitly fails if Vitest discovers zero tests.

Run:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
```

Pure selector/view-model tests cover allocation invariants, runover geometry,
heat-map boundaries, Home/Explorer behavior, and exact drill-down contracts.
SQLite integration tests cover demo load, idempotency, current-only allocation
persistence, historical targets, typed parameterised queries, classified reads,
and ownership-safe reset.

Android was the locally available runtime for this foundation smoke test. An
iOS runtime smoke test remains a platform validation step when a supported
macOS/Xcode simulator environment is available.

## Synthetic and personal data boundary

Development, CI, Expo Go, emulators, screenshots, and demo builds use only
committed synthetic fixtures. They must not require Monzo, OAuth, a bank app,
credentials, tokens, or a real account. No application network/auth path exists
in Phase 0. Personal-data import belongs exclusively to the later Monzo
milestone and must remain behind the source-adapter boundary.

## Deferred quality gates

These are requirements for their owning backlog stages, not Phase 0 features:

- export/restore must use a versioned strict schema, validate completely, and
  commit atomically; never expose a raw full-table JSON dump;
- transaction-editor drafts must be durable before editor UI ships;
- device end-to-end tests must cover fresh install, upgrade retention, fixture
  import, reclassification, offline restart, export/restore, and wipe as those
  owning features ship;
- release builds require persistent signing identity and reproducible build
  instructions; signing secrets never enter the repository;
- every migration series must prove both fresh-install and retained-data upgrade
  paths before release.

## Dependency audit note

The current Expo CLI dependency tree reports a moderate advisory through its
build-time `xcode -> uuid` tooling. npm offers only a forced downgrade to an
obsolete Expo release, so the project does not apply that breaking
recommendation. Recheck on Expo upgrades. No vulnerable package is called by
the semantic engine or used to store application data.
