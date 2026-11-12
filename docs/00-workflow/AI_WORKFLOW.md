# Vibe Ledger — AI Development Workflow

**Document ID:** WF-AI  
**Status:** Draft — trial workflow on the documentation rebuild branch  
**Version:** 0.1  
**Ownership:** Agent task lifecycle, development permissions, Git operations, verification, merging and release boundaries

## 1. Purpose

Vibe Ledger is both a local-first personal finance application and an experiment in **autonomous AI-assisted software development**.

Agents should be able to discover authoritative context, implement and improve features, update documentation and tests, and merge verified work without routine human approval. Human oversight happens **retrospectively through categorised GitHub Issues and periodic review summaries**.

Autonomy does not remove the obligation to prove correctness or record decisions. Work that cannot be verified must not be described as complete.

**Related authority:**
- [Documentation Standards](DOCUMENTATION_STANDARDS.md) owns documentation conventions, unique definitions, backlinks and structural validation.
- [Ownership Map](OWNERSHIP_MAP.md) identifies which document owns each concept.
- [Money Model](../MONEY_MODEL.md) owns financial semantics.
- [Product Specification](../PRODUCT_SPEC.md) owns current product scope pending the documentation migration.
- [Roadmap](../ROADMAP.md) and [Backlog](../BACKLOG.md) contain the existing planned build sequence and tasks.

This workflow defines **how work is executed**. It does not redefine financial rules, design decisions or component contracts.

## 2. Operating model

1. **AI implementation is autonomous by default.** Human approval is not required for every code or documentation change.
2. **Specifications are the starting authority.** Agents may revise a specification only with an articulated justification and traceable impact.
3. **Authority is ownership-based.** The central ownership map identifies the relevant specification; no legacy global priority list overrides it.
4. **Decisions are reviewable.** Meaningful agent decisions, contradictions and unresolved risks go to GitHub Issues. Routine implementation choices stay in commits/PRs.
5. **Structural integrity is enforced.** Applicable checks must pass; agents must not disable them to make progress.
6. **Development merge is not release approval.** Permission to merge code does not grant authority to release software, touch real funds or expose private data.

These are operating principles for the experiment. The documentation standards define how cross-references and ownership metadata are represented and maintained.

## 3. Task intake and context discovery

An agent may work from a GitHub Issue, an explicitly assigned task or an agreed implementation milestone. The task should state a desired outcome, scope and known constraints. When requirements are incomplete, an agent should first inspect the available project evidence.

**Before editing:**

1. Read the concise [agent entry point](../../AGENTS.md).
2. Identify the task's owning concepts through the [Ownership Map](OWNERSHIP_MAP.md).
3. Read the owning specifications and their acceptance criteria.
4. Follow relevant outgoing dependencies and incoming consumers.
5. Search code, tests and other documentation for relationships not yet represented by links.
6. Identify the applicable checks, likely regression surface and existing GitHub Issues or PRs.

Do not load the entire documentation corpus indiscriminately. The information web is a guide, not proof that every dependency has already been documented.

**Future goal:** automatically assemble task-specific context from the ownership map, references, code and tests. This capability is not yet implemented and should not be represented as available.

## 4. Decision authority and risk

| Class | Illustrative decisions | Required agent response |
| --- | --- | --- |
| Routine | Naming, local refactoring, equivalent implementation technique | Decide and proceed; normal commit/PR record is sufficient |
| Meaningful | New component boundary, interaction detail, significant architecture choice or justified requirement revision | Decide, implement with evidence, and create or update a categorised human-review Issue |
| Unresolved or high-impact | Conflicting financial invariants, uncertain data deletion, credential exposure, unverifiable security or data-integrity change | Isolate affected work, document the risk, create a high-priority Issue; do not claim the behaviour is verified or release it |

**Controlled autonomy** means agents may choose reasonable implementation details independently, while product-level choices and durable deviations remain visible to humans. It does not mean every decision waits for approval.

**Financial and security boundary:** Agents MUST NOT weaken financial invariants, historical integrity, source-data separation or security guarantees merely to pass tests or simplify implementation. A proposed substantive change requires documented reasoning, affected requirements, regression evidence and a prominent retrospective review ticket. If safe verification is impossible, do not merge the unsafe affected change as completed work; unrelated verified work may proceed.

## 5. Standard task lifecycle

### 5.1 Plan a bounded change

Identify the issue or goal, the specification owner, affected consumers, requirements and test strategy. Prefer small, independently testable and revertible changes over large multi-purpose batches.

Use a descriptive branch and commit history. Do not assume any fixed branch naming convention is enforced unless repository tooling explicitly establishes it.

### 5.2 Implement against the owned specification

Implement the defined behaviour and preserve existing domain invariants. Keep imported bank data separate from local app-owned interpretations, as defined by the [Money Model](../MONEY_MODEL.md) and [Data Model](../DATA_MODEL.md).

Do not add features merely because they are conventional for finance apps. The product's scope is intentionally narrow.

Where an existing implementation contradicts documentation:

- Investigate whether code or the specification is outdated.
- Prefer the authoritative specification unless there is a justified improvement.
- If revising the specification, change the requirement, relevant acceptance criteria, code and tests coherently.
- Record the rationale and affected references in a review Issue.

Passing tests that an agent has just rewritten is not, by itself, proof that a requirement change is beneficial.

### 5.3 Maintain the information web

Follow the [Documentation Standards](DOCUMENTATION_STANDARDS.md) for single ownership, cross-references, stable IDs, deprecation and change propagation.

For documentation edits, run:

~~~bash
python3 tools/check_docs.py --write-backlinks
python3 tools/check_docs.py
~~~

Run the script from the repository root. The first command writes mechanically generated \`Used by\` sections; the second validates structure and detects stale generated sections.

If a semantic consumer cannot be reconciled safely, document the impact in a GitHub Issue. Generated backlinks are navigation metadata, **not** normative specifications.

### 5.4 Verify

Before proposing or merging a change:

- Run relevant unit, integration, widget and acceptance tests that exist for the touched functionality.
- Exercise boundary cases and regressions, especially financial and classification behaviour.
- Run documentation unit tests and structural validation for documentation changes.
- Check that acceptance criteria still follow the owning requirements, rather than being independently redefined by tests.
- Verify that generated files are up to date and no required check was disabled.
- Record what was actually tested and any coverage or environment limitations.

Current documentation CI is defined in [docs-validation.yml](../../.github/workflows/docs-validation.yml). Other code checks must be added as implementation matures. Do not claim tests exist or pass if they have not been run.

### 5.5 Record decisions and unresolved issues

Use **GitHub Issues**, not a separate decision registry, for retrospective human review.

Suggested labels (to be configured in GitHub):

- \`decision:product\`, \`decision:design\`, \`decision:technical\`
- \`docs:contradiction\`, \`docs:gap\`, \`docs:structure\`
- \`needs-human-review\`
- Priority labels distinguishing critical, normal and informational review

Search for a matching open Issue before creating another. Group closely related decisions into one coherent ticket.

A review Issue should include:

- Decision or discrepancy and its category.
- Why it arose, the agent's choice and alternatives considered.
- Authoritative source(s) and stable requirement IDs, where available.
- Affected files, consumers, tests and commit or PR links.
- Impact/risk, unresolved questions and suggested human action.

If the agent lacks the GitHub permission to create or update a required Issue, it must state that limitation explicitly and leave a clearly linked review record in the PR/task handoff. It MUST NOT claim an Issue was created. A required high-impact review record cannot be silently skipped.

### 5.6 Merge verified work autonomously

Agents MAY merge verified changes without waiting for routine human approval **when**:

1. The branch is up to date enough to avoid merging known conflicts, and the change is reviewable and revertible.
2. Applicable required CI and repository protection rules pass.
3. Relevant requirements, code and tests agree, or any safe unresolved impact is explicitly tracked.
4. Required meaningful-decision review records exist.
5. No unverified high-impact behaviour is represented as finished.
6. The merge does not bypass permissions, protection rules or security controls.

Use normal PR-based reviewable history where repository tooling permits. Do not force-push protected branches, override failed checks, disable test steps or fabricate evidence of passing tests.

**Autonomous merge is a documented target workflow, not a claim that branch-protection rules, deployment gates or all needed CI checks are already configured.** If an enforcement mechanism is missing, disclose the gap and improve it; do not treat absence of a check as proof of correctness.

### 5.7 Release remains a separate action

Merging into \`main\` is not the same as authorising deployment, granting access to production secrets, connecting real bank accounts, deleting user data or interacting with money.

Until a separate release policy is adopted, agents MUST NOT infer permission to perform consequential external actions from autonomous merge authority alone.

## 6. Contradictions and deferred review

When documents contradict:

1. Use the [Ownership Map](OWNERSHIP_MAP.md) to identify the concept owner.
2. Apply the owner's rule as the working definition **only when this remains safe**.
3. Create a \`docs:contradiction\` Issue linking conflicting documents and proposing a fix.
4. Update clear downstream references immediately.
5. Defer genuinely unresolved semantic implications through a linked Issue.

Structural problems—broken internal links, duplicate IDs, invalid ownership entries and stale generated backlinks—are blocking once the relevant checker exists.

Potentially incorrect domain semantics, security properties, data loss and destructive behaviour require proportionate scrutiny. Work can proceed on **independent verified parts**, not on a knowingly ambiguous or unsafe claim.

Do not silently make an obsolete document authoritative again simply because it contains convenient instructions.

## 7. Human oversight and experimental measurement

Humans review substantive agent decisions **after implementation**, using categorised GitHub Issues. Routine merged work is visible in Git and PR history.

Periodic digests SHOULD summarise:

- Significant decisions and unresolved contradictions.
- Routine merges with links, not duplicated content.
- High-priority issues and time outstanding.
- Corrections, regressions and reversions worth inspecting.

No automated digest schedule or issue-label setup is implied by this document. Those are follow-up implementation tasks.

To assess whether this system helps, collect lightweight measures from available GitHub and CI evidence: specification-driven rework, escaped defects, contradiction resolution time, test failures, agent correction rate, maintenance effort and review queue age.

Do not equate faster merging or fewer tickets with greater correctness without qualitative review.

## 8. Existing repository transition

The older specifications and [Backlog](../BACKLOG.md) remain present while we migrate to responsibility-based ownership. The [Ownership Map](OWNERSHIP_MAP.md) names their current roles and outstanding transfers.

This workflow supersedes the obsolete **global source-of-truth order** previously stated in \`AGENTS.md\`; it does not automatically revise the contents of legacy product, UX, money or data specifications.

The existing build milestone remains: prove the deterministic domain and classification engine with fixture data and acceptance tests before relying on live Monzo sync. Detailed sequencing and exclusions remain in the [Roadmap](../ROADMAP.md) and [Product Specification](../PRODUCT_SPEC.md).

## 9. Definition of complete

An AI development task can be marked complete only when:

- The intended behaviour and its authoritative owner are identified.
- The implementation satisfies applicable acceptance criteria.
- Relevant automated checks have actually passed or limitations are disclosed.
- Cross-references and generated backlinks are up to date.
- Meaningful decisions and unresolved impacts have review records.
- The change is merged or its precise handoff state is disclosed.
- No unsupported claim of release, deployment or real-data integration is made.

**Open follow-ups:** Configure actual GitHub labels and issue templates, strengthen application CI as implementation begins, establish a review-digest cadence, and define any future release policy separately.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [AGENTS.md](<../../AGENTS.md>)
- [README.md](<../../README.md>)
- [docs/00-workflow/OWNERSHIP_MAP.md](<OWNERSHIP_MAP.md>)
<!-- GENERATED: BACKLINKS END -->
