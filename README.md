# Vibe Ledger

A local-first personal budgeting and spending-analysis app built on top of Monzo transaction data.

Vibe Ledger exists to answer a small set of questions clearly:

1. How did I allocate this month's money between **Living**, **Saving** and **Fun**?
2. How much of each allocation have I used?
3. Which allocation is under or over target, and by how much?
4. What categories and transactions caused that result?
5. How has that pattern changed over time?
6. What recurring subscriptions am I carrying, including annual and multi-year renewals?

The app deliberately does **not** try to replace Monzo as a bank, become an investment tracker, provide AI financial advice, or reconstruct the philosophical provenance of every pound after money has been moved between accounts.

## Build documents

Read these in order:

1. [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — product scope, screens and behaviour.
2. [`docs/MONEY_MODEL.md`](docs/MONEY_MODEL.md) — the canonical semantics for income, spending, saving and transfers.
3. [`docs/ACCEPTANCE_SCENARIOS.md`](docs/ACCEPTANCE_SCENARIOS.md) — concrete examples the implementation must pass.
4. [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) — suggested local data model and derived calculations.
5. [`docs/UX_SPEC.md`](docs/UX_SPEC.md) — page-level UI requirements and interactions.
6. [`docs/MONZO_INTEGRATION.md`](docs/MONZO_INTEGRATION.md) — integration constraints and sync strategy.
7. [`docs/ROADMAP.md`](docs/ROADMAP.md) — build sequence and beta scope.
8. [`docs/BACKLOG.md`](docs/BACKLOG.md) — implementation tickets with stable IDs.
9. [`AGENTS.md`](AGENTS.md) — instructions for implementation agents.

An investor/product-overview slideshow is included at [`docs/product-overview.html`](docs/product-overview.html).

## Status

The core product model is sufficiently defined to start implementation.

The highest-risk area is **Monzo authentication/sync for a phone-only local app**, not the budgeting logic. The Monzo Developer API is suitable for a personal/small-user project, but its OAuth model creates constraints for a purely client-side app. See `docs/MONZO_INTEGRATION.md`.

## Non-negotiable product principles

- A bank debit is **not automatically spending**.
- A bank credit is **not automatically income**.
- Raw bank data is preserved; Vibe Ledger stores its own interpretation separately.
- Categories answer **what was this for?**
- Super-categories answer **which monthly allocation does this belong to?**
- Event type answers **what happened financially?**
- Budget scope answers **should this event affect monthly budget calculations?**
- User corrections always override automatic classification.
- Historical monthly targets must not be rewritten when the current allocation changes.
- No generative AI is required for the beta.
