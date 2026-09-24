# Monzo Integration

Verified against Monzo's public documentation on 24 September 2026.

Primary reference:
- https://docs.monzo.com/

Open Banking reference:
- https://docs.monzo.com/open-banking/

## 1. What the Developer API provides

Monzo documents:

- OAuth 2.0 authentication;
- accounts;
- transactions;
- merchant/category information;
- pots;
- webhooks;
- transaction metadata.

The Developer API is explicitly described as suitable for the developer's own account or a small explicitly allowed set of users, not a public application.

That matches the initial personal beta.

---

## 2. Important authentication constraint

Monzo distinguishes confidential and non-confidential OAuth clients.

Their documentation states that **non-confidential clients are not issued refresh tokens**.

A native phone app cannot safely keep a client secret in the same way a server can, so a strict "phone only, absolutely no backend" architecture conflicts with seamless long-lived OAuth refresh.

This is currently the largest implementation uncertainty.

Do not hide it.

---

## 3. Recommended beta integration choices

### Option A — strict local-only prototype

- authenticate as allowed by Monzo;
- sync on demand / app foreground;
- accept re-authentication limitations;
- no webhooks;
- all analytics and persistent transaction interpretation remain local.

Pros:
- closest to desired privacy model.

Cons:
- auth friction may be unacceptable;
- background sync is limited.

### Option B — thin personal sync broker (recommended if necessary)

A minimal service does only:
- confidential OAuth secret handling;
- refresh-token handling;
- optional webhook endpoint;
- secure transaction sync handoff.

The phone still owns:
- budgeting rules;
- categories;
- classifications;
- history database where feasible;
- analytics;
- charts;
- subscription metadata.

The service must not contain AI or analytics.

Pros:
- reliable authentication and event sync.

Cons:
- not strictly phone-only;
- requires hosting and security work.

### Option C — future public product

Use regulated Open Banking access directly or through an appropriate provider.

Out of beta scope.

---

## 4. Initial history import

Monzo documentation states that immediately after authentication the client can fetch full transaction history; after 5 minutes, transaction syncing is restricted to the previous 90 days.

Implementation requirement:
- perform initial history import immediately after successful authentication;
- persist source transaction IDs locally;
- mark `initial_history_complete`;
- subsequent syncs use incremental windows and upsert by source transaction ID.

---

## 5. Raw-data rule

Do not design budget semantics around Monzo's consumer-app presentation.

The adapter should ingest the most useful raw API fields and map them into `raw_transactions`.

Then Vibe Ledger classifies those records independently.

This is the entire reason the application can treat:

```text
Monzo → pot £200
Monzo → Moneybox £200
```

as equivalent saving contributions even if Monzo presents them differently.

---

## 6. Pot handling

Monzo exposes a pots endpoint and pot balances.

Where a reliable pot-related event can be identified:
- preserve pot identity/name as source metadata;
- apply a user-configurable classification rule.

Do not assume every transfer-like API event is automatically a saving contribution. Some pots may be spending buffers.

---

## 7. Webhooks

Monzo webhooks require a reachable URL.

Therefore:
- they are incompatible with a purely offline/local phone app without a service;
- do not make webhook delivery mandatory for beta;
- app must support pull/incremental sync;
- a thin broker may add webhooks later.

---

## 8. Security

- never store Monzo login credentials;
- OAuth tokens must use platform secure storage;
- never commit client secrets;
- keep raw transaction payloads out of logs in production builds;
- provide a local data wipe;
- if a broker exists, minimise retained data and document it.
