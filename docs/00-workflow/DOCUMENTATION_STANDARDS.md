# Vibe Ledger — Documentation Standards

**Status:** Draft — committed for review, not yet ratified  
**Version:** 0.1  
**Document:** `docs/00-workflow/DOCUMENTATION_STANDARDS.md`

> **Core principle: Define once, reference everywhere.** Documentation is an information web, not a collection of independent Markdown files.

This document describes the **intended standard**. A transitional [ownership map](OWNERSHIP_MAP.md), initial [structural checker](../../tools/check_docs.py), its tests and [GitHub Actions workflow](../../.github/workflows/docs-validation.yml) are implemented on the documentation branch. Backlink generation and stale-output validation are implemented. Broader validation coverage, issue automation and legacy-specification migration remain future work.

## 1. Purpose and scope

Vibe Ledger uses documentation as a structured, interconnected specification system for human understanding and autonomous AI-driven software development.

The system should:

- Give each product, design, domain or engineering concept one authoritative definition.
- Prevent competing specifications and silently divergent behaviour.
- Make relevant context discoverable by both humans and agents.
- Trace requirements to components, code, tests, decisions and issues.
- Evolve with the application without excessive documentation overhead.
- Support a measurable experiment in autonomous AI-assisted development.

This document owns documentation structure, authorship conventions, authority, references, validation and maintenance. Operational rules for agent permissions, PRs, branch management, CI deployment and releases belong in `AI_WORKFLOW.md` when that document exists.

**Normative language:** **MUST** is mandatory, **SHOULD** is a strong recommendation with justifiable exceptions, and **MAY** is optional.

## 2. Fundamental principles

### 2.1 Single authoritative definition

Every normative concept MUST have exactly one authoritative definition. Examples include financial calculations, product interactions, component behaviour, navigation, design token meanings, data contracts and architectural constraints.

Other documents MUST link to that definition, rather than repeat it in independently maintained prose. Duplicated normative definitions are documentation defects.

Short non-normative summaries MAY help orient a reader, provided they are clearly contextual, point to the owner and cannot be mistaken for an alternate contract.

### 2.2 Responsibility hierarchy without global precedence

Documents belong to layers of responsibility. Documents within the same layer MUST NOT independently own the same rule. They MAY reference each other and discuss different facets of a shared feature.

For example:

- A Home functional specification owns Home's two-position snap-scroll behaviour.
- A calendar component specification owns the calendar's internal rendering and interaction.
- A Flutter gesture specification owns the technical implementation approach.

All may mention the feature. Only the relevant owner defines each rule.

There is no universal rule that a document in a higher-numbered or lower-numbered folder automatically overrides another. Authority is **ownership-based**. Circular links may exist; circular authority must not.

### 2.3 Extensibility

The initial folder hierarchy, component catalogue, page list and engineering documents are **not exhaustive**. Agents may identify missing responsibilities and add documents or components when justified.

Do not create a document for every trivial widget or concept. Do not assume a component absent from the initial Markdown inventory does not exist or cannot be introduced.

### 2.4 Readability and precision

Prefer concise structured Markdown over unnecessary formal schemas. Use examples, tables and Mermaid diagrams when they clarify complex relationships. Separate normative statements from examples and rationale. Keep functional requirements observable and testable.

## 3. Documentation domains

| Location | Owns |
|---|---|
| `docs/00-workflow/` | Documentation governance, ownership, references and AI workflow |
| `docs/01-philosophy/` | Product and design principles |
| `docs/02-product/` | Product requirements, financial semantics, data models and integrations |
| `docs/03-design-system/` | Shared visual language, design-token usage, accessibility rules |
| `docs/04-components/` | Reusable component contracts, grouped as primitives, composites and features |
| `docs/05-pages/` | Page-specific layout, interactions, navigation and flows |
| `docs/06-engineering/` | Flutter implementation strategy and technical contracts |
| `docs/07-quality/` | Testing strategy and cross-feature verification |
| `docs/08-handoff/` | Figma-to-engineering and implementation handoffs |
| `design-tokens/` | Authoritative machine-readable visual values |

These are responsibility boundaries, not an exhaustive file manifest.

**Financial rules** belong in their owning product/domain specifications, never in independently maintained page-specific interpretations.

**Shared visual values** belong in design tokens. Design-system docs explain semantics, while components refer to tokens instead of embedding repeated magic values. The design-token format should be chosen so Figma and Flutter can consume the same source without defining competing values.

**Component specifications** own their purpose, inputs/outputs, states, internal interactions, accessibility, component-level acceptance criteria and dependencies. Component documents SHOULD reference shared primitives and tokens rather than redefine them.

**Page design specifications** own page composition and placement. **Page functional specifications** own page-level behaviours and navigation. Flow diagrams describe journeys and states without creating new competing requirements.

**Engineering specifications** own how the application is built. The implementation does not silently become the authority for desired product behaviour.

## 4. Central ownership map

**Proposed location:** `docs/00-workflow/OWNERSHIP_MAP.md`.

A single central ownership map MUST identify where major normative concepts and requirement families are defined. It is authoritative about **location of ownership**, not about the substance of each definition.

Example entries (illustrative, not yet an adopted map):

~~~yaml
allocation-ring.interaction:
  owner: docs/04-components/features/AllocationRing.md
home.snap-scroll:
  owner: docs/05-pages/home/FUNCTIONAL.md
financial.budget-period:
  owner: docs/02-product/MONEY_MODEL.md
flutter.gesture-implementation:
  owner: docs/06-engineering/GESTURES_AND_ANIMATION.md
~~~

Rules:

1. Each normative concept MUST have one registered owner.
2. The ownership map MUST point to active, existing authoritative documents.
3. Ownership claims MUST NOT overlap.
4. Ownership transfers MUST update the map and affected references in the same change.
5. Ambiguous ownership MUST be surfaced in a categorised GitHub Issue; agents must not invent a secret precedence order.
6. Map entries SHOULD represent meaningful concepts and requirement families, not individual sentences.

**Implementation default:** start with a human-readable ownership map in Markdown. If validation becomes cumbersome, use a machine-readable source with a generated Markdown view, but do not manually maintain two authoritative versions.

## 5. Document conventions

Normative documents SHOULD have:

1. A title and stable document ID, where useful.
2. Status: Draft, Active, Migrating or Deprecated.
3. A short purpose and explicit statement of what the document owns.
4. Authoritative dependencies expressed as relative Markdown links.
5. The specification and its owned requirements.
6. Acceptance criteria alongside each independently testable requirement.
7. Examples and rationale clearly distinguished from normative content.
8. Relevant related documentation.
9. A generated **Used by** or backlinks section once tooling exists.

Omit irrelevant template sections rather than filling them with boilerplate.

Documents in **Draft** are proposed, not authoritative. **Active** documents own their registered responsibilities. **Migrating** documents are in controlled transfer, with ownership made explicit. **Deprecated** documents are non-authoritative navigational stubs, not alternate specifications.

Renaming or moving a document SHOULD preserve its ID.

## 6. Requirements and acceptance criteria

Requirements SHOULD be concise, structured and understandable without knowledge of a particular implementation. Give each independently testable or traceable requirement a stable ID.

Example:

~~~markdown
### HOME-012 — Two-position navigation

The Home page supports exactly two stable vertical positions:
collapsed and expanded.

**Acceptance criteria**
- Initial position is collapsed.
- An upward swipe transitions to expanded.
- A downward swipe transitions to collapsed.
- No intermediate resting position persists after settling.
- Bottom navigation remains visible in both states.

**Dependencies**
- [Home design](DESIGN.md)
~~~

Acceptance criteria MUST live **alongside the authoritative requirement**. They must describe observable success, including important boundaries and failure modes where relevant.

- Page-level behaviour is owned by the relevant page specification.
- Component-internal behaviour is owned by the component specification.
- Shared financial/domain rules are owned by domain specifications.
- Tests reference requirement IDs instead of maintaining separate normative expectations.
- A single test MAY verify multiple requirements.
- Cross-feature acceptance scenarios MAY coordinate several requirements without redefining them.

IDs MUST be unique. Retired IDs MUST NOT be reused for unrelated requirements. Moving a requirement SHOULD preserve its ID so tickets, tests and history remain meaningful.

**Structural refinement:** ordinary pages do not need separate `ACCEPTANCE.md` files merely to duplicate requirements. Quality documents may still own cross-cutting test plans and integration coordination.

## 7. Information web: references and backlinks

### 7.1 Define once, reference everywhere

Use GitHub-compatible relative Markdown links, preferably pointing to a relevant heading or requirement. Documents MUST refer to an existing authoritative definition rather than paraphrase it into another normative rule.

### 7.2 Bidirectional navigation

The web must support:

- **Outgoing links:** what this document depends on.
- **Incoming links:** who uses or relies on this document.

Outgoing links are authored. Incoming links SHOULD be generated from actual references wherever practical. Backlinks support navigation and impact analysis; they do not grant normative authority.

### 7.3 Mechanical maintenance

The checker can now generate backlinks and report incoming references. Future dependency indexes and impact-analysis tooling SHOULD additionally support queries such as:

- Which pages depend on BudgetProgress?
- Which consumers depend on a particular design token or financial rule?
- Which tests verify a requirement?
- What is affected by changing or retiring a component?

Generated content MUST be visibly delimited and contain no new normative rules:

~~~markdown
<!-- GENERATED: BACKLINKS START -->
## Used by
- [Home design](../../05-pages/home/DESIGN.md)
<!-- GENERATED: BACKLINKS END -->
~~~

Backlinks SHOULD be regenerated when sources change, checked in CI and periodically audited for semantic correctness. An unreferenced document is a review signal, not automatically a defect.

### 7.4 Change propagation

Scripts SHOULD handle deterministic operations such as rebuilding indexes, repairing unambiguous links and validating references. AI agents handle semantic changes, conflicts, requirement revisions and test implications.

Automated maintenance MUST be deterministic, idempotent and diff-visible. It MUST NOT silently rewrite normative specifications based on inferred meaning. Renaming a file does not automatically authorise changing the meaning or IDs of the concepts inside it.

## 8. Granularity and component discovery

Split documentation by coherent responsibility, not by fixed file size or one-file-per-widget rules.

Extract a concept when it has independently meaningful behaviour, a distinct owner or lifecycle, multiple consumers, or has become difficult to maintain in its current document.

Keep tightly coupled concepts together when splitting would force readers or agents to open many tiny files for one task.

The component catalogue MUST be treated as **extensible and potentially incomplete**. Significant structural changes SHOULD produce a `docs:structure` Issue for retrospective review.

## 9. Context discovery by AI agents

**Current approach: Dependency-driven context.**

An agent modifying a concept SHOULD:

1. Consult the ownership map.
2. Read the owning specification.
3. Follow the relevant outgoing dependencies.
4. Inspect inbound consumers for impacts.
5. Search code, tests and other docs for relationships missing from the graph.
6. Identify relevant requirement IDs and acceptance criteria.

Agents SHOULD NOT indiscriminately read every Markdown file when task-specific context suffices. However, they MUST NOT treat the reference graph as infallibly complete.

**Future goal: Automatically assembled context.** A later context assembler may gather owner docs, dependencies, consumers, constraints, relevant tests and provenance for a task. This is an explicit future objective, not a prerequisite for present development. The information web SHOULD be designed so that future tooling can traverse it.

## 10. Controlled autonomy and specification authority

**Decision:** agents exercise controlled autonomy and can merge independently of routine human approval under the operational safeguards defined in `AI_WORKFLOW.md`.

Routine decisions (variable names, straightforward refactoring and equivalent implementation details) do not require individual decision tickets.

Meaningful product, design, technical or documentation decisions MUST be recorded for retrospective human review through categorised GitHub Issues.

Specifications are the default authority over existing code. However, agents MAY autonomously revise a specification for a justified product or technical improvement when they:

- Explain the benefit and alternatives.
- Identify affected requirements.
- Update specification, code and tests together where applicable.
- Inspect affected dependencies and consumers.
- Create or update the relevant review Issue.

An agent MUST NOT weaken a requirement merely because implementation is inconvenient or because tests have been adjusted to pass. Financial invariants, security properties, data-integrity guarantees and destructive operations require heightened scrutiny. Unverifiable high-impact behaviour MUST NOT be represented as complete.

**Separation of authority:** this document records the documentation implications of autonomy; `AI_WORKFLOW.md` owns the executable merge and release procedures. Autonomous merge to the development branch is not automatically permission for production release.

## 11. Contradictions and deferred consistency

When documents contradict each other, the designated concept owner supplies the working definition. The agent MUST create a GitHub Issue with the conflicting links, owner, affected requirements, rationale and proposed correction.

Ownership does not guarantee correctness. If the owner appears outdated or ambiguous, that uncertainty must be documented and investigated.

**Decision:** consistency with deferred review.

Agents MUST update affected documentation when the appropriate changes are clear. Unresolved semantic impacts MAY be deferred through tickets while independently verified work proceeds. Deferred review MUST NOT conceal a contradiction or let the agent claim disputed behaviour is complete.

Separate:

- **Structural consistency** (broken links, duplicate IDs, invalid ownership, stale generated output): blocking CI failures once checks are implemented.
- **Semantic consistency** (possible contradiction, duplicated meaning, ambiguous requirement): agent investigation and review tickets, with severity appropriate to risk.

Work affected by an unresolved financial, security or data-integrity ambiguity MUST NOT be declared verified solely because current tests pass.

## 12. Human-review queue in GitHub

**No separate decision registry.** GitHub Issues are the central review mechanism. Git commits and PRs already record routine work.

Suggested labels:

- `docs:contradiction`
- `docs:gap`
- `docs:structure`
- `decision:product`
- `decision:design`
- `decision:technical`
- `needs-human-review`

Meaningful issues SHOULD state the question, proposed resolution, alternatives (if useful), relevant owners and requirement IDs, affected commits/PRs, and priority.

Related decisions may be grouped into one coherent ticket. Agents SHOULD check for existing issues before creating duplicates.

Priorities should distinguish critical (financial, security, data integrity, destructive), normal (functional, architectural, design) and informational matters. High-priority issues SHOULD have explicit review expectations, even when they do not block independently safe work.

**Periodic review summaries** SHOULD link to routine merges and notable tickets without copying their entire contents. The goal is focused human oversight, not one ticket per change.

## 13. Validation and CI

**Decision:** structural enforcement.

Once implemented, deterministic documentation checks MUST block autonomous merges when they fail. CI SHOULD verify:

- Internal Markdown links and anchors.
- Unique document and requirement IDs.
- Valid ownership-map entries and no duplicate owners.
- Required metadata when applicable.
- Current generated backlinks and dependency indexes.
- Integrity of generated-file boundaries.

A local tool MAY repair deterministic references. CI SHOULD independently validate the committed result and fail on stale generated files; it MUST NOT silently rewrite normative specifications.

AI-assisted semantic analysis MAY flag possible contradictions, ambiguous criteria and duplicated normative meaning. These probabilistic checks should be advisory or generate review tickets rather than universally block merges.

Checks should explain how to fix failures. Agents MUST NOT disable or weaken required checks merely to merge.

**Implementation status:** The initial [checker](../../tools/check_docs.py) currently verifies Markdown links and anchors, selected stable IDs, and ownership-map entries. CI runs the checker and its regression tests and fails when generated backlinks are stale. `python3 tools/check_docs.py --write-backlinks` writes or refreshes backlink sections; `--report-backlinks` lists incoming references without editing files. Semantic contradiction detection, full requirement traceability and automatic commits of generated changes remain future work; agents run the writer before committing.

## 14. Controlled deprecation and migration

**Decision:** controlled deprecation, rather than immediate deletion or permanent archival.

To retire a document:

1. Inventory its owned concepts and requirements.
2. Migrate them to explicitly designated new owners, or intentionally retire them.
3. Update the ownership map.
4. Update inbound references and affected tests.
5. Verify that substantive knowledge was not lost.
6. Replace the obsolete document with a clearly **non-authoritative** redirect or notice.
7. Remove the stub after references are repaired and it is no longer needed.

A document MUST NOT become non-authoritative before its responsibilities are transferred or retired. Git history remains the long-term archive; duplicate historical files SHOULD NOT remain in the active information web.

Any unresolved migration gaps require GitHub Issues.

## 15. Measuring documentation effectiveness

**Decision:** lightweight measurable evaluation.

Prefer metrics derivable from GitHub, PRs and CI without extensive manual reporting:

| Measure | Why it matters |
|---|---|
| Structural validation failures | Broken references and metadata drift |
| Contradiction tickets and time to resolution | Semantic documentation debt |
| Rework caused by specification gaps | Costs of ambiguity |
| Agent task success and correction rate | Actual implementation effectiveness |
| Human-review backlog and age | Sustainability of retrospective oversight |
| Documentation maintenance effort | Cost of maintaining the information web |

Combine quantitative signals with periodic qualitative review of real agent decisions and shipped behaviour. Fewer tickets may mean underreporting; faster merges may mean more downstream rework.

Collect a baseline before setting targets. A future, more rigorous comparison of dependency-driven context and automatically assembled context is a worthwhile experiment, but not a prerequisite for building Vibe Ledger.

## 16. Documentation review checklist

Before a substantial documentation change is complete, the agent SHOULD confirm:

- [ ] This behaviour has a single known authoritative owner.
- [ ] No other document independently redefines it.
- [ ] Authoritative dependencies are linked.
- [ ] Downstream consumers have been inspected.
- [ ] Requirement IDs are stable and acceptance criteria testable.
- [ ] The ownership map reflects the current definition.
- [ ] Mechanical links and backlinks are current.
- [ ] Code and test implications have been considered.
- [ ] Unresolved issues have categorised GitHub tickets.
- [ ] Structural validation passes, once implemented.
- [ ] Significant autonomous decisions remain traceable.

## 17. Immediate rollout boundaries

This draft captures the 15 agreed documentation decisions and establishes the intended architecture. It does not yet create every related file or enforcement mechanism.

Implementation can proceed incrementally:

1. Establish `OWNERSHIP_MAP.md` and document templates.
2. Migrate legacy specifications without losing their requirements.
3. Implement link, ID and ownership validation.
4. Regenerate backlinks and develop richer dependency indexes.
5. Add CI enforcement and review-ticket automation.
6. Evolve towards automatically assembled agent context.

Use the existing checker for the rules it currently supports. Agents must still manually assess semantic consistency, uncovered dependencies, and any rules not yet automated; they must not claim full enforcement.

**Status:** This remains a draft until reviewed and promoted to Active. The `main` branch is not changed by committing it on `docs/ai-workflow-rebuild`.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [AGENTS.md](<../../AGENTS.md>)
- [README.md](<../../README.md>)
- [docs/00-workflow/AI_WORKFLOW.md](<AI_WORKFLOW.md>)
- [docs/00-workflow/OWNERSHIP_MAP.md](<OWNERSHIP_MAP.md>)
<!-- GENERATED: BACKLINKS END -->
