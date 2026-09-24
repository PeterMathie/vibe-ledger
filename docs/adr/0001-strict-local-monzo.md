# ADR 0001: Strict-local Monzo integration first

## Status

Accepted for the beta architecture; implementation deferred to the Monzo phase.

## Decision

The first Monzo adapter will target a strict-local native app flow. Monzo is a
source adapter only:

```text
Monzo adapter -> immutable raw records -> classification -> budget domain
```

The domain and persistence APIs must not expose Monzo response shapes. Pull sync
and explicit foreground refresh are the initial operating model. We accept that
Monzo's non-confidential OAuth client constraints may require reauthentication
and prevent reliable background sync.

Live OAuth and sync are not part of Phase 0.

## Security boundaries

- OAuth credentials are never collected by the app.
- Future access tokens must be stored with platform secure storage, not
  AsyncStorage, SQLite, source code, fixtures, crash reports, or logs.
- Client secrets must never ship in an Android or iOS bundle.
- Raw payloads and transaction details must not be written to production logs.
- The local SQLite database is app-private. Future export must require an
  explicit user action and avoid tokens; wipe must remove the database and
  secure token material.
- Sync requests should ask only for permissions required for read import.
- Dependency updates and CI checks must not require repository secrets.

## Broker escape hatch

If beta evidence shows reauthentication or foreground-only sync is
unacceptable, a minimal broker may be introduced behind the adapter boundary.
That decision requires a new ADR and threat model.

A broker, if approved, is limited to confidential OAuth handling, refresh-token
rotation, and minimal sync handoff. It must use least privilege, encryption in
transit and at rest, short retention, authenticated device handoff, auditable
deletion, redacted logs, and no analytics or budgeting logic. No broker is built
or deployed by this decision.
