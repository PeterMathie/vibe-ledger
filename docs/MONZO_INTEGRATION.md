# Monzo integration

Verified against Monzo's public documentation on 24 September 2026. The pinned
source links and architectural decision are recorded in
[`adr/0001-strict-local-monzo.md`](adr/0001-strict-local-monzo.md).

## Implemented mock-safe foundation

- TypeScript DTOs for accounts, transactions, merchants, and pots.
- Runtime validation and mapping into source records with signed integer minor
  units, original currency, stable source/account IDs, settlement and deletion
  state.
- An allow-listed raw payload snapshot. Unknown fields, metadata, notes,
  merchant addresses, credentials, and headers are not persisted.
- Separate source-account, source-pot, and sync-state tables. None are domain
  classifications.
- Idempotent transaction upsert by source identity, durable incremental
  timestamp cursor with a seven-day overlap, atomic batch writes, and
  full/partial-history status.
- A secure-token-store abstraction, Expo SecureStore implementation, and
  in-memory test implementation. No token is needed for mock sync.
- Redirect/state/PKCE validators and token redaction helpers. They are security
  primitives, not an enabled OAuth flow.
- Bounded timeout/retry/cancellation policy for a future client. There is no
  production network implementation and no background sync.
- Settings always defaults to `Demo · Not connected`. Development builds expose
  an explicit synthetic mock-sync button; production builds do not.

The mock uses synthetic Monzo-shaped values only. It exercises adapter and sync
behavior without contacting Monzo.

## Current Monzo facts that affect the design

Monzo documents OAuth 2.0, accounts, signed minor-unit transactions, pots,
pagination, errors, and webhooks. The constraints that matter here are:

- non-confidential clients do not receive refresh tokens;
- public clients must re-authenticate after access-token expiry;
- the documented authorization-code exchange requires a client secret;
- redirect `state` mismatch must abort;
- the docs do not describe PKCE;
- full transaction history can be fetched immediately after authentication;
- after five minutes, transaction sync is limited to the previous 90 days;
- transaction pagination supports timestamp or object-ID cursors with a maximum
  page size of 100;
- `429` is documented, but no fixed quota is promised;
- webhooks require a reachable URL and are retried up to five times.

The docs show a `deleted` flag for pots. They do not currently document a
deleted-transaction list field. The adapter can preserve a transaction deletion
tombstone if Monzo supplies one, but a future network client must verify the
actual contract before requesting or relying on deleted transactions.

## Semantic boundary

Monzo source categories and pot names are import hints only. A £200 transfer to
a pot and a £200 transfer to an external savings provider can have equivalent
budget meaning only after the deterministic classification layer says so.
Neither adapter mapping nor sync assigns an event type, budget scope, category,
or saving contribution.

## Real connection remains disabled

Do not add a client secret, playground token, personal payload, live redirect,
or real OAuth test to this repository. A native live flow stays disabled until
Monzo documents a secret-free native exchange (including PKCE) or the minimal
broker in the ADR is separately approved, built, and operated.

The user must also accept one of two UX outcomes: repeated foreground
reauthorization with no automatic freshness, or the privacy/security
responsibilities of a confidential broker. Neither decision is made by this
spike.
