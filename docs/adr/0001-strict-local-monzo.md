# ADR 0001: Strict-local Monzo integration first

## Status

Accepted for the mock-safe beta foundation. Live authorization remains blocked.

## Decision

Monzo remains a source adapter only. DTOs map into app-owned source records and
immutable source identities before the existing classification and budget
domain. Monzo categories, pots, and presentation do not determine budget
meaning.

The app implements explicit foreground/manual sync contracts, durable cursors,
idempotent source-ID upserts, and platform secure-token storage. It does not
implement a network client or enable live OAuth. Development can run the same
adapter and sync path using committed synthetic Monzo-shaped objects.

## Evidence reviewed

Verified 24 September 2026 against Monzo's public documentation repository at
commit `58a52e1fa21593514ea934715bbb415c18e4865e`:

- [Authentication](https://github.com/monzo/docs/blob/58a52e1fa21593514ea934715bbb415c18e4865e/source/includes/_authentication.md)
  says non-confidential clients receive no refresh tokens, public clients must
  re-authenticate, token exchange requires `client_secret`, redirect `state`
  must match, and only one access token per client/user is active.
- [Transactions](https://github.com/monzo/docs/blob/58a52e1fa21593514ea934715bbb415c18e4865e/source/includes/_transactions.md)
  says all history is available immediately after authentication, but after
  five minutes only the previous 90 days can be synced.
- [Pagination](https://github.com/monzo/docs/blob/58a52e1fa21593514ea934715bbb415c18e4865e/source/includes/_pagination.md)
  documents time/cursor pagination, default limit 30, and maximum limit 100.
- [Pots](https://github.com/monzo/docs/blob/58a52e1fa21593514ea934715bbb415c18e4865e/source/includes/_pots.md)
  documents integer minor-unit balances, currencies, source IDs, and deletion
  state.
- [Errors](https://github.com/monzo/docs/blob/58a52e1fa21593514ea934715bbb415c18e4865e/source/includes/_errors.md)
  documents `429 Too Many Requests` but no numeric quota or retry-header
  contract.
- [Webhooks](https://github.com/monzo/docs/blob/58a52e1fa21593514ea934715bbb415c18e4865e/source/includes/_webhooks.md)
  requires a reachable callback URL and documents up to five retries with
  exponential backoff.

The reviewed public documentation contains no PKCE or `code_challenge`
contract. Absence from documentation is not proof that Monzo will never support
PKCE; it is sufficient reason not to invent or ship such a flow.

## Strict-local feasibility

Strict-local storage and manual data sync are feasible. Safe long-lived native
authorization is not currently demonstrated:

- embedding a confidential client secret in a mobile bundle is prohibited;
- the documented code exchange requires that secret;
- non-confidential clients do not receive refresh tokens;
- no documented PKCE exchange removes the secret requirement;
- initial full-history import has a five-minute operational deadline;
- native-only operation cannot receive Monzo webhooks;
- foreground/manual sync cannot promise automatic freshness.

Therefore live authorization fails closed. The Settings surface says
`Demo · Not connected`; startup performs no network request; only an explicit
development action invokes the in-memory mock API. A future live flow requires
Monzo-confirmed native-client guidance or the separately approved broker below.

## Local security and sync policy

- Tokens exist only behind `SecureTokenStore`; the production implementation
  uses Expo SecureStore with device-only, unlocked accessibility. SQLite,
  exports, fixtures, logs, screenshots, and source never contain tokens.
- Wipe deletes secure token material before Monzo source/sync rows. Secure-store
  failure is visible and fails closed.
- Raw payload JSON is a constructed allow-list. It excludes metadata, notes,
  merchant addresses, headers, credentials, and unrecognized response fields.
- Source IDs are stable and unique. Re-sync may update a source snapshot when
  Monzo settles, reverses, or deletes a transaction, but never rewrites
  app-owned classification history.
- Sync fetches every page before opening the write transaction. A page or
  validation failure writes nothing; database failure rolls back the complete
  batch.
- Initial sync records whether history is full or limited to 90 days. A missed
  five-minute window remains visibly partial and cannot be represented as full.
- Incremental sync uses the persisted timestamp cursor with a bounded seven-day
  overlap so recently created pending transactions can settle or be tombstoned,
  then upserts by `(source, source_transaction_id)`. It never requests earlier
  than the documented 90-day post-authentication boundary.
- No hidden background task exists. Cancellation propagates; offline, timeout,
  rate-limit, authorization, validation, and storage failures remain explicit.
- A future HTTP client is restricted to Monzo HTTPS origins, assumes platform
  trust validation and TLS 1.2 or newer, uses a 15-second timeout, bounded
  exponential backoff, at most three attempts, and honors a validated
  server-provided retry delay. Certificate pinning is not assumed because no
  maintainable Monzo pin set is published.

## Minimal confidential broker fallback

No broker is implemented or deployed. If approved later, its protocol is
limited to:

1. The app creates a device-held key and nonce and starts authorization through
   a broker-issued, short-lived, single-use session.
2. The broker validates the registered redirect, OAuth state, session expiry,
   nonce, and app proof before exchanging the code with its confidential
   secret.
3. The broker stores the refresh token encrypted at rest under a managed key;
   the app receives only a short-lived, audience-bound broker session.
4. Authenticated app requests include timestamp, nonce, request-body digest,
   and device proof. The broker rejects replayed or expired nonces and rate
   limits per device/user/IP.
5. Pull responses contain only the minimum allow-listed account, pot, and
   transaction fields. Delivery is idempotent and cursored.
6. Webhook ingress authenticates using the strongest mechanism Monzo documents
   at implementation time, validates body limits/content, deduplicates event
   IDs, and treats the event as a prompt to refetch rather than trusted ledger
   state. Current public docs do not document webhook signatures, so unsigned
   production webhook ingestion is not approved.
7. Refresh-token rotation is atomic; superseded tokens are destroyed.
   Disconnect revokes upstream access where available, invalidates all app
   sessions, and deletes retained data and keys.

The broker retains no raw transaction history after successful delivery, no
analytics identifiers, and no request/response bodies in logs. Operational logs
use redacted event codes and short retention. Hosting owners become responsible
for secrets management, key rotation, patching, monitoring, backups, incident
response, abuse controls, deletion evidence, availability, and applicable data
protection/regulatory obligations. A separate ADR, threat-model review, privacy
notice, retention schedule, and deployment approval are mandatory before use.

## User-owned prerequisites for any real connection

- Confirm the intended personal/small-user Developer API use with Monzo.
- Obtain written/current confirmation of supported native OAuth/PKCE behavior,
  redirect URI requirements, scopes, token lifetime, and revocation behavior.
- Decide whether repeated re-authentication is acceptable; otherwise approve
  and operate the broker security responsibilities above.
- Register exact production redirect URIs and provide platform association
  files where applicable.
- Complete physical-device secure-store, deep-link hijack, backup/restore,
  wipe, and lost-device tests without using production data in CI or fixtures.
