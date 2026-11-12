# AGENTS.md — Vibe Ledger

This is the **entry point**, not an alternative specification. Read the authoritative documents linked below before making changes. Do not independently redefine their rules in this file.

## Mission

Build the deliberately narrow, local-first Vibe Ledger budgeting app, and use the project to evaluate **autonomous, specification-driven AI development**.

AI may be used to **build** Vibe Ledger; a generative-AI dependency is not a product requirement.

## Required reading and authority

1. [AI Development Workflow](docs/00-workflow/AI_WORKFLOW.md) — autonomous implementation, decisions, testing, merge and release boundaries.
2. [Documentation Standards](docs/00-workflow/DOCUMENTATION_STANDARDS.md) — define once/reference everywhere, traceability, backlinks and validation.
3. [Ownership Map](docs/00-workflow/OWNERSHIP_MAP.md) — where each concept's authoritative definition lives.
4. Read **task-specific owners** and their dependencies. Core current owners include:
   - [Design Philosophy](docs/01-philosophy/DESIGN_PHILOSOPHY.md) — visual hierarchy, interaction principles and design judgement.
   - [Money Model](docs/MONEY_MODEL.md) — financial semantics and invariants.
   - [Product Specification](docs/PRODUCT_SPEC.md) — current scope, pending migration.
   - [Data Model](docs/DATA_MODEL.md) — logical schema and persistence.
   - [Monzo Integration](docs/MONZO_INTEGRATION.md) — external integration constraints.
   - [Roadmap](docs/ROADMAP.md) and [Backlog](docs/BACKLOG.md) — existing sequencing.

**There is no global source-of-truth priority list.** Authority is assigned by the ownership map. If two documents disagree, follow the responsible owner where safe, create a GitHub Issue for the contradiction, and do not guess at risky financial or security behaviour.

Some existing files predate these standards and remain under controlled migration. Their presence is not evidence that their requirements are mutually consistent.

## First implementation milestone

Implement and test the deterministic financial/classification engine using **fixture data before relying on live Monzo integration**. See the [Roadmap](docs/ROADMAP.md), [Money Model](docs/MONEY_MODEL.md) and [Acceptance Scenarios](docs/ACCEPTANCE_SCENARIOS.md).

The application must be able to explain why a raw event produces a given budget effect. Do not revise the money model simply because a UI shortcut or passing test would be convenient.

## Engineering and UI boundaries

Read the owning specification for detailed contracts. In particular:

- Preserve bank-source records and keep local interpretations separately editable.
- Store money without binary floating-point arithmetic; preserve original currencies.
- Keep the domain model independent of Monzo API response shapes.
- Keep classifications and aggregations deterministic and testable.
- Build mobile-first, accessible UI; colour alone cannot signal status.
- Keep aggregate-to-transaction drill-down traceable.
- Do not silently exclude financial events or invent finance-app features.
- Avoid an in-app generative-AI feature, investment-return tracking or general accounting product unless the product specification is deliberately revised.

This is a **brief orientation**, not a replacement for the [Money Model](docs/MONEY_MODEL.md), [Data Model](docs/DATA_MODEL.md), [Product Specification](docs/PRODUCT_SPEC.md) or [Monzo Integration](docs/MONZO_INTEGRATION.md).

## Every change

1. Identify the feature owner, requirements and relevant consumer documents.
2. Implement bounded, testable changes; revise specifications only with a justified and traceable decision.
3. Update affected requirements, tests and documentation.
4. For Markdown changes, regenerate and verify backlinks:

   ~~~bash
   python3 tools/check_docs.py --write-backlinks
   python3 tools/check_docs.py
   ~~~

5. Run relevant application tests and the available CI checks. Do not claim unrun checks passed.
6. Create or update categorised GitHub Issues for meaningful decisions, conflicts and unresolved impacts; routine work stays in commit/PR history.
7. Merge verified work autonomously only within the safeguards in the [AI Development Workflow](docs/00-workflow/AI_WORKFLOW.md). **A merge is not permission to deploy or handle real funds or credentials.**

## Known transition

The old global precedence rules and obsolete page name **Explorer** are being migrated to ownership-based documentation and the **Breakdown** navigation concept. Do not perpetuate the old hierarchy or implement outdated behaviour without checking the relevant owner and current change decisions.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [README.md](<README.md>)
- [docs/00-workflow/AI_WORKFLOW.md](<docs/00-workflow/AI_WORKFLOW.md>)
- [docs/00-workflow/OWNERSHIP_MAP.md](<docs/00-workflow/OWNERSHIP_MAP.md>)
<!-- GENERATED: BACKLINKS END -->
