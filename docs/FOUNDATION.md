# Foundation Architecture

## Scope

This foundation implements the Phase 0 semantic engine for the Expo app,
targeting Android and iOS from one TypeScript codebase. It deliberately does
not implement product screens, Monzo OAuth, live sync, search, subscription
detection, or a sync broker.

## Module boundaries

```text
Expo React Native UI (future)
        |
        v
Pure TypeScript domain (src/domain)
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
- Node's in-memory SQLite implementation is used only to execute real migration
  and importer SQL in tests. Android runtime persistence remains Expo SQLite.

Run:

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
```

UI and platform end-to-end tests should be added with their corresponding UI
tickets; Phase 0 tests exercise observable domain outcomes and database
constraints.

Android was the locally available runtime for this foundation smoke test. An
iOS runtime smoke test remains a platform validation step when a supported
macOS/Xcode simulator environment is available.

## Dependency audit note

The current Expo CLI dependency tree reports a moderate advisory through its
build-time `xcode -> uuid` tooling. npm offers only a forced downgrade to an
obsolete Expo release, so the project does not apply that breaking
recommendation. Recheck on Expo upgrades. No vulnerable package is called by
the semantic engine or used to store application data.
