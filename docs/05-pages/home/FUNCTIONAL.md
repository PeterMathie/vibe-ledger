# Home — Functional Specification

**Status:** Draft — page behaviour for design and implementation review  
**Document ID:** PAGE-HOME-FUNCTIONAL  
**Version:** 0.1  
**Owner:** Home page composition of states, navigation and interaction orchestration; not financial calculations or individual component geometry.

## Purpose and authority

Home answers **“How am I doing against my allocations in the selected budget period?”** It presents progress visually, exposes the corresponding financial facts and allows a direct path to the transactions behind each aggregate.

This document owns **Home-specific behaviour**. It does not duplicate the mathematical definitions in the [Money Model](../../MONEY_MODEL.md), the product-wide goals in the [Product Specification](../../PRODUCT_SPEC.md), or the interaction philosophy in [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md).

Existing [UX notes](../../UX_SPEC.md) and [acceptance examples](../../ACCEPTANCE_SCENARIOS.md) are migration references, not a second source of Home page behaviour. Exact layout, visual token values, dimensions, motion curves, colours and Figma frames are intentionally **not decided here**.

### Authoritative dependencies

- [Money Model](../../MONEY_MODEL.md) — budget base, ratios, spending, saving contributions, withdrawals, refunds, scope and invariants.
- [Data Model](../../DATA_MODEL.md) — current monthly budget storage, until a custom-period model is designed.
- [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md) — visual-first hierarchy, contextual expansion, objective feedback, delight and precision.
- [Documentation Standards](../../00-workflow/DOCUMENTATION_STANDARDS.md) — stable requirement IDs and acceptance criteria next to their owner.
- [Ownership Map](../../00-workflow/OWNERSHIP_MAP.md) — ownership transfers and future component contracts.

## Scope

Home is composed conceptually of:

1. Period navigation and a current-period summary.
2. An allocation control for **Living, Saving and Fun**.
3. Three super-category progress summaries.
4. A spending calendar with compact weekly and expanded period views.
5. Direct routes into **Breakdown** with contextual filters.

Home has **exactly two stable vertical presentation positions**. Other destinations, such as Settings and the experimental Money Map, are secondary to the four primary destinations: Home, Breakdown, Trends and Subscriptions. This document does not own their internal behaviours.

Component-level specifications may later own allocation-ring geometry and gesture handling, progress-bar rendering and calendar-cell semantics. Until those contracts exist, the page-level acceptance criteria here define the required observable Home behaviour.

## Requirements and acceptance criteria

### HOME-001 — Meaningful initial state

On entry, Home presents the currently selected budget period (defaulting to the current period), a clear comparison against allocations and a route to the supporting transactions. It starts in the compact/collapsed position unless returning to a preserved Home session state.

**Acceptance criteria**

- The current period is identifiable without opening Settings.
- The user can identify progress for Living, Saving and Fun without navigating away.
- Monetary values supporting those progress views are directly available in the same context.
- Home does not invent a financial status if sufficient underlying data is unavailable.
- A return from another tab preserves the Home selection/state when the navigation session is retained.

### HOME-002 — Exactly two vertical snap positions

Home supports two stable vertical positions: **collapsed** and **expanded**.

**Collapsed:** allocation overview, three super-category summaries and a compact Monday–Sunday calendar week are in the Home experience.

**Expanded:** the same three summaries remain accessible, the calendar presents the full active period, and the allocation ring is above the visible viewport rather than duplicated or removed from page state.

The transition is a **single continuous vertical scroll** between two settled positions, not navigation to a separate calendar page.

**Acceptance criteria**

- A vertical gesture can transition between the two positions.
- After gesture settling, no third persistent snap position exists.
- The expanded state shows the period calendar; the compact state shows a week.
- Exactly one logical instance of each summary and allocation control is maintained across transitions.
- The expanded state does not add redundant copies of headings solely to restate the same information.
- The bottom navigation remains available in both states.
- Reduced-motion settings retain equivalent functionality without requiring decorative animation.

### HOME-003 — Period selection and period-scoped data

Home navigates between budget periods, with clear previous/next controls and an unambiguous selected-period label.

Home must not silently combine records from different periods. The period boundaries, stored targets and date membership must be supplied by the **authoritative domain period model**, not recalculated independently inside Home.

**Acceptance criteria**

- Selecting a different period updates all period-scoped financial summaries and calendar data consistently.
- Historical periods display their own recorded targets rather than applying current settings retroactively.
- Returning to a previously selected period does not silently change its allocation.
- A period with no records is represented explicitly; absence of records is not presented as a successful financial outcome.
- Any day outside the selected period cannot contribute to the period's totals or heatmap aggregates.

**Migration dependency:** the existing [Money Model](../../MONEY_MODEL.md) and [Data Model](../../DATA_MODEL.md) use calendar months. Custom payday-based periods (including a configured day that may not occur in shorter months) are an intended extension. Their boundary algorithm, persistence identity and historical migration require a **domain-level specification change before they are implemented**. Home must not invent or own that algorithm.

### HOME-004 — Compact week navigation

The compact calendar represents one Monday–Sunday week. The user can move between weeks while retaining clear awareness of which budget period is selected.

**Acceptance criteria**

- Seven days appear in Monday-through-Sunday order, including empty days.
- Week navigation updates the highlighted/visible week without mutating spending data.
- The active period remains identifiable after week navigation.
- Days shown solely to complete a week, but outside the selected period, appear as context and are excluded from its totals.
- Navigating into an adjacent period must produce an explicit, coherent period context; it must not silently display out-of-period spend as part of the previously selected period.

**To settle in component design:** exact week-arrow behaviour at a period boundary (stop, switch period or continue with clear context). The invariant above applies in every case.

### HOME-005 — Allocation ring is locked by default

The allocation control communicates the Living, Saving and Fun shares of the period's budget base. Accidental changes are prevented through a locked default state.

**Acceptance criteria**

- The control initially prevents accidental dragging or numerical changes.
- A clearly discoverable unlock action enables editing.
- When locked, displayed proportions and targets remain readable.
- A user can deliberately re-lock the control.
- Editing the allocation never changes imported bank events.
- Every successfully committed set of allocation ratios satisfies the total-allocation invariant defined in the [Money Model](../../MONEY_MODEL.md).

### HOME-006 — Direct manipulation and precise numerical editing

Users can adjust allocation shares visually and by directly editing the displayed percentage or monetary target, without requiring a separate settings screen.

**Acceptance criteria**

- Both drag interaction and direct numerical input lead to the same resulting valid allocation state.
- The updated ratios and target monetary values remain mutually consistent.
- Users can see the numbers they are changing, not only the ring's appearance.
- Invalid edits are rejected or corrected transparently; they are never silently stored as inconsistent totals.
- An edit to the current period does not rewrite historical period targets.
- If the adjustment changes another allocation to preserve the total, the affected values are visibly updated before the change is considered committed.
- The precise-input path is available without a drag gesture.

**Component contract still required:** the deterministic redistribution rule when one value is edited, rounding policy, cancellation/confirmation and lock lifecycle. This document defines observable safeguards but **does not guess** which other allocation should absorb a change.

### HOME-007 — Three super-category progress summaries

Home has one summary each for Living, Saving and Fun. They show progress against the corresponding target with directly accessible monetary facts.

**Acceptance criteria**

- Living and Fun use the relevant budget-included spending values owned by the [Money Model](../../MONEY_MODEL.md).
- Saving target progress uses **gross saving contributions**; it is not reduced by withdrawals.
- Net savings movement is available as a distinct secondary fact and is never relabelled as Saving target progress.
- Each summary exposes the relevant target, actual and remaining/exceeded amount when meaningful.
- The same underlying financial facts produce consistent values in both Home positions.
- Visual status reflects the semantics of the metric; surpassing a Saving contribution target is not incorrectly treated as an overspending warning.

### HOME-008 — Progress beyond 100%

Spending progress does not become misleadingly compressed when Living or Fun spending exceeds the target.

**Acceptance criteria**

- At or below 100%, progress occupies no more than one full budget-length row.
- Above 100%, the representation continues into additional rows, with each complete additional row representing another 100% of the target.
- The amount above a spending target is distinguishable from the amount within it.
- At approximately 238% usage, the display represents two full target-length rows and a partial third rather than squeezing everything into one row.
- Extremely large overages remain proportional in the underlying representation without creating an unbounded, unusable screen; the visible area may be capped/scrollable or virtualised.
- When visual area is capped, exact numeric progress and overspend remain accessible.
- A zero or otherwise unusable denominator never creates a division-by-zero, infinite percentage or misleadingly normal progress bar.

The historical [runover scenarios](../../ACCEPTANCE_SCENARIOS.md) provide examples for tests; geometry and rendering strategy may be delegated to a future component specification.

### HOME-009 — Calendar spending semantics

The Home calendar is a spending **heatmap**, not a savings-progress heatmap. Each date represents included Living and Fun spending, using the [Money Model](../../MONEY_MODEL.md) for classification and adjustments.

The daily comparison reference is the active period's combined Living and Fun targets divided by the number of dates in that period. Home does not redefine how individual transactions contribute to those totals.

**Acceptance criteria**

- A day with zero included spending is visually neutral.
- A day with included spending below the daily comparison amount is distinguished as below the comparison level.
- A day at that amount is the end of the below/at-range; a day above it uses the over-range.
- A day with only saving contributions does not incorrectly appear to have spending.
- Refunds, reimbursements and excluded events affect the heatmap only as defined by the financial model.
- Every date has an accessible representation of its value and comparison status independent of colour.
- The colour scale's exact hues and intensities are left to the eventual design system, but below/at/above semantics must remain distinguishable.
- The display handles a zero daily comparison threshold without invalid arithmetic.

The historical [heatmap scenarios](../../ACCEPTANCE_SCENARIOS.md) remain test examples while the exact rendering contract is migrated.

### HOME-010 — Expanded period calendar

The expanded Home position displays a calendar spanning the selected budget period while retaining context about its boundary dates.

**Acceptance criteria**

- All dates belonging to the selected period are represented.
- Dates outside the period may appear to complete surrounding calendar weeks but are visually de-emphasised and excluded from period totals.
- The calendar does not fabricate spending to fill missing dates.
- Compact and expanded views agree on the spending status of the same in-period date.
- Expanding and collapsing the calendar does not change the selected period or financial results.

**Future component decision:** how periods spanning portions of two calendar months are labelled and arranged in Figma. It must not alter the underlying membership of dates in the active period.

### HOME-011 — Drill-down to Breakdown

Home's progress summaries and calendar dates provide direct access to **Breakdown**, preserving the selected financial context.

**Acceptance criteria**

- Selecting a Living, Saving or Fun summary opens Breakdown with the selected period and matching super-category filter.
- Selecting an in-period calendar date opens Breakdown filtered to that **exact date**, not only the week or month.
- The transferred filter state is inspectable and does not silently broaden the result set.
- Returning to Home retains the useful exploration state when feasible.
- The destination is labelled **Breakdown** in the new navigation model; references to **Explorer** in legacy documents refer to its earlier working name.

**Boundary:** Breakdown owns its own results, editing, category lists and search implementation. This document only owns Home's outgoing navigation intent and filter handoff.

### HOME-012 — Navigation and state continuity

The primary destinations are Home, Breakdown, Trends and Subscriptions. Home does not create a fifth primary destination for the expanded calendar.

**Acceptance criteria**

- Changing bottom tabs does not unintentionally edit a budget or transaction.
- Returning to Home preserves its selected period and expanded/collapsed state within a retained navigation session unless a deliberate reset is made.
- A date or category drill-down preserves enough context for the destination to represent the user's original selection.
- Settings and Money Map remain secondary destinations; their internal navigation is outside this document.

### HOME-013 — Empty, stale and offline states

Home must not pretend data is current when it is missing or stale, and it must remain useful with locally stored data.

**Acceptance criteria**

- With no imported transactions, Home presents an understandable empty state without fake spending activity.
- Previously imported local data can be viewed without an active network connection.
- Sync freshness or failure is discoverable without replacing the main financial information with irrelevant alerts.
- Unknown or incomplete values are not silently treated as real zero balances.
- A failed refresh does not discard valid cached financial data.
- No financial totals are made up to keep the dashboard visually full.

### HOME-014 — Accessibility and interaction parity

The visual-first experience must be usable without relying exclusively on dragging, colour discrimination or animation.

**Acceptance criteria**

- The locked/unlocked state and interactive controls have meaningful accessibility labels and states.
- Allocation values can be adjusted with precise input without requiring a drag.
- Budget progress and calendar status have textual/numeric alternatives to colour.
- Touch and keyboard/accessibility-focus paths can reach essential actions.
- Reduced-motion preferences do not suppress access to the expanded view or financial facts.

## Home-level state transitions

~~~mermaid
stateDiagram-v2
    [*] --> Collapsed
    Collapsed --> Expanded: Vertical scroll / snap
    Expanded --> Collapsed: Reverse scroll / snap
    Collapsed --> Breakdown: Summary or date selection
    Expanded --> Breakdown: Summary or date selection
    Breakdown --> Collapsed: Return (if collapsed was retained)
    Breakdown --> Expanded: Return (if expanded was retained)
~~~

The diagram expresses navigational intent only; it is not an animation timing or gesture recognition algorithm.

## Figma handoff: behaviour to accommodate, not prescribe

Figma exploration must accommodate the two distinct Home states, a default-locked editable allocation control, three persistent progress summaries, a compact week, a full period calendar, period/week navigation, and clear numeric drill-down.

The final geometry, visual emphasis, typography, touch targets, motion curves, card arrangement and exact icons should be developed in Figma and subsequently formalised through design-system tokens and component specifications. The design may reveal legitimate changes to this functional contract; such changes should be intentional and traceable.

## Outstanding decisions and migration dependencies

These are **not silently settled** by this file:

1. **Budget period model:** legacy [Money Model](../../MONEY_MODEL.md), [Data Model](../../DATA_MODEL.md) and [Product Specification](../../PRODUCT_SPEC.md) are calendar-month based. Payday periods require a domain-owned contract, historical-storage plan and test cases before implementation.
2. **Allocation edit policy:** the future ring component must specify how other shares respond to an exact edit, how basis-point/rounding differences are resolved, and cancel/undo/reset semantics.
3. **Week boundary navigation:** clarify whether moving a week beyond the active period switches the period or retains a contextual week without mutating active-period totals.
4. **Legacy authority:** [Product Specification](../../PRODUCT_SPEC.md) §5.1 and [UX Specification](../../UX_SPEC.md) §2 remain historical summaries for Home; Home page behaviour is now owned here.
5. **Exact visual details:** defer to Figma and subsequent design-system and component specs.

These should be logged as a coherent retrospective design/technical review item; ambiguous parts must not be inferred by implementation agents.

## Definition of ready for implementation

Home implementation is ready when the financial period contract, allocation editing policy and Breakdown filter handoff are precise enough to test, and the Figma/component contracts specify the necessary presentation. This document is adequate as a **functional input to Figma**, not proof that those dependencies are already implemented.
