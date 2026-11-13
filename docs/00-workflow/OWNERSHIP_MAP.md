# Vibe Ledger — Ownership Map

**Status:** Draft — transitional ownership during documentation rebuild  
**Document ID:** DOC-OWNERSHIP  
**Companion standard:** [Documentation Standards](DOCUMENTATION_STANDARDS.md)

## Purpose

This is the central index of **where authoritative definitions live**, not a replacement for those definitions. Consult the owning document for the actual rule. The entries below map responsibilities to **existing files on this branch**; they do **not** assert that legacy content has already been reconciled with the new documentation standards.

**Define once, reference everywhere.** Peer documents may refer to a concept but must not independently define the same normative rule.

## Current ownership entries

The machine-checkable section below is deliberately simple. The documentation checker treats the first column as a unique concept key and the second as an existing repository-relative Markdown file. It does not infer semantic correctness from a valid path.

<!-- OWNERSHIP:START -->
| Concept | Owner | Scope |
| --- | --- | --- |
| `docs.standards` | `docs/00-workflow/DOCUMENTATION_STANDARDS.md` | Documentation conventions, validation and information-web rules |
| `docs.ownership` | `docs/00-workflow/OWNERSHIP_MAP.md` | Mapping concepts to their authoritative documents |
| `design.philosophy` | `docs/01-philosophy/DESIGN_PHILOSOPHY.md` | Cross-cutting interaction and visual design principles |
| `page.home.functional` | `docs/05-pages/home/FUNCTIONAL.md` | Home page states, navigation, calendar and allocation interaction orchestration |
| `page.breakdown.functional` | `docs/05-pages/breakdown/FUNCTIONAL.md` | Breakdown scopes, views, navigation, and financial summary presentation |
| `component.transaction-search` | `docs/04-components/features/TRANSACTION_SEARCH.md` | Local four-group search query builder and predicate semantics |
| `page.breakdown.design-intent` | `docs/05-pages/breakdown/DESIGN_INTENT.md` | Transitional pre-Figma layout and visual intent, not exact design tokens |
| `agents.workflow` | `docs/00-workflow/AI_WORKFLOW.md` | Autonomous agent lifecycle, permissions, verification, merging and release boundaries |
| `product.definition` | `docs/PRODUCT_SPEC.md` | Product aims, scope and primary capabilities |
| `product.navigation-legacy` | `docs/PRODUCT_SPEC.md` | Existing navigation specification; pending page-level migration |
| `finance.semantics` | `docs/MONEY_MODEL.md` | Money concepts, calculations and financial invariants |
| `quality.financial-scenarios-legacy` | `docs/ACCEPTANCE_SCENARIOS.md` | Legacy cross-feature scenario examples; must not override the money model |
| `data.logical-model` | `docs/DATA_MODEL.md` | Logical schema and persistence entities |
| `integration.monzo` | `docs/MONZO_INTEGRATION.md` | Monzo import, sync and integration boundaries |
| `ux.design-legacy` | `docs/UX_SPEC.md` | Existing UX and visual composition; pending design-system/page migration |
| `delivery.roadmap` | `docs/ROADMAP.md` | Planned phases and sequencing |
| `delivery.backlog` | `docs/BACKLOG.md` | Legacy implementation task breakdown |
| `agents.entrypoint` | `AGENTS.md` | Agent navigation entry point; links to the owning operational and product specifications |
<!-- OWNERSHIP:END -->

The cross-cutting principles are now defined in [Design Philosophy](../01-philosophy/DESIGN_PHILOSOPHY.md). Specific visual values and component behaviours retain separate owners. Home page behaviour is now owned by the [Home Functional Specification](../05-pages/home/FUNCTIONAL.md). [Breakdown](../05-pages/breakdown/FUNCTIONAL.md) and its [Transaction Search Contract](../04-components/features/TRANSACTION_SEARCH.md) now own the V1 exploration and local search behaviour; the [pre-Figma design intent](../05-pages/breakdown/DESIGN_INTENT.md) records agreed direction. Exact visual design remains a Figma/handoff task.

## Planned ownership transfers

These are **future destinations, not active owners**. The files may not exist yet and therefore do not appear in the validated table.

| Responsibility | Planned destination |
| --- | --- |
| Design tokens and visual rules | `design-tokens/tokens.json`, `docs/03-design-system/` |
| Reusable component contracts | `docs/04-components/` (extensible; not an exhaustive inventory) |
| Other page-specific behaviour | `docs/05-pages/<page>/FUNCTIONAL.md` |
| Page composition | `docs/05-pages/<page>/DESIGN.md` |
| Flutter technical contracts | `docs/06-engineering/` |
| Cross-feature testing strategy | `docs/07-quality/` |

A transfer is complete only after the new owner exists, requirements and acceptance criteria are migrated, the active entry is updated and dependent references are repaired.

## Known migration concerns

1. **Agent authority rule reconciled:** [AGENTS.md](../../AGENTS.md) now delegates workflow authority to [AI_WORKFLOW.md](AI_WORKFLOW.md) and uses ownership-based document authority. Existing product and UX specifications still need content-by-content migration.
2. **Financial examples:** [ACCEPTANCE_SCENARIOS.md](../ACCEPTANCE_SCENARIOS.md) calls itself executable product truth. Under the new structure, financial definitions belong in the [Money Model](../MONEY_MODEL.md), with requirement-level acceptance criteria next to requirements. Migrate and cross-link examples without changing financial semantics silently.
3. **UX and feature drift:** [UX_SPEC.md](../UX_SPEC.md) and [PRODUCT_SPEC.md](../PRODUCT_SPEC.md) still contain older navigation, Home and Explorer summaries. [Home Functional Specification](../05-pages/home/FUNCTIONAL.md) and [Breakdown Functional Specification](../05-pages/breakdown/FUNCTIONAL.md) now own those respective pages; the latter replaces Explorer and its old search grammar. Migrate Trends/Subscriptions and other page behaviour separately. The payday-period domain model remains an outstanding dependency.
4. **Historical decisions:** [DECISIONS.md](../DECISIONS.md) is a legacy decision record, not a second source of authority. Meaningful new AI decisions should use categorised GitHub Issues.

## Rules for editing this map

- Each concept key appears exactly once.
- Each active owner is an existing repository-relative file.
- The map identifies the owner but does not duplicate its contract.
- Add new concepts when genuinely needed; do not aim for an exhaustive inventory of every sentence or widget.
- Reclassifications must update relevant dependent specifications and links.
- Raise a GitHub Issue for ambiguous ownership or unresolved semantic contradictions.
- Run `python3 tools/check_docs.py` after any change to documentation structure or ownership.

This document is **draft** until existing specifications have been reconciled; mechanical validation can start before all migrations are complete.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [AGENTS.md](<../../AGENTS.md>)
- [README.md](<../../README.md>)
- [docs/00-workflow/AI_WORKFLOW.md](<AI_WORKFLOW.md>)
- [docs/00-workflow/DOCUMENTATION_STANDARDS.md](<DOCUMENTATION_STANDARDS.md>)
- [docs/01-philosophy/DESIGN_PHILOSOPHY.md](<../01-philosophy/DESIGN_PHILOSOPHY.md>)
- [docs/05-pages/home/FUNCTIONAL.md](<../05-pages/home/FUNCTIONAL.md>)
<!-- GENERATED: BACKLINKS END -->
