# Trends — Functional Specification

**Status:** Draft — agreed page behaviour for product/design review  
**Document ID:** PAGE-TRENDS-FUNCTIONAL  
**Version:** 0.1  
**Planned release:** V1

## 1. Purpose and authority

Trends answers **"How has my financial activity changed over time, and what made up a particular day?"**

The **interactive timeline chart is the primary feature**. Supporting facts and lists are subordinate, collapsible and contextual. The page supports progressive examination of financial activity: **Overview → super-category → individual category**. At each depth, the user can inspect any specific day's matching activity without leaving the chart.

This specification owns Trends page states, period selection, chart-level navigation, contextual day inspection, chart-versus-panel layout and landscape expansion. It **does not** redefine financial event classification, saving contributions, withdrawals, refunds, budget scope, category ownership or historical period calculation. Those belong to the [Money Model](../../MONEY_MODEL.md). It references the [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md) for visual-first hierarchy and the [Home](../home/FUNCTIONAL.md) and [Breakdown](../breakdown/FUNCTIONAL.md) contracts for shared context and page boundaries.

The older Trends sections in [Product Specification](../../PRODUCT_SPEC.md) and [UX Specification](../../UX_SPEC.md) are migration references, **not competing V1 chart or interaction requirements**. Exact geometry, animation, colour tokens, gesture thresholds and Figma frames are deferred to component/design work.

## 2. Page structure and conceptual model

- **Primary:** prominently sized time-series chart with date and monetary scales, a prominent figure for the active scope and date range, and unobtrusive chart expansion.
- **Scope:** Overview (All), Living, Fun, Saving, then an individual category within the selected super-category. Income is an event type, **not a fourth super-category**.
- **Time:** directly accessible presets **7D, 30D, 90D, 12M** and **Custom**.
- **Supporting panel:** a fixed maximum-height, internally scrollable, **collapsible** breakdown immediately beneath the headline and **above** the chart.
- **Orientation:** portrait Trends plus intentional full-screen **landscape chart**.
- **Day focus:** a selected date applies to the contextual breakdown at **every scope**; clearing the date restores the full selected-range breakdown.

The chart stays physically below the information panel in portrait, including at individual-category depth. The chart is never displaced by an unbounded transaction list. See the [Money Model](../../MONEY_MODEL.md) for the meaning of amounts; Trends' "financial activity" combines spending with contributions **without identifying contributions as spending**.

## 3. Requirements and acceptance criteria

### TRND-001 — Default state and clear hierarchy

Default entry shows the currently selected time range, **Overview**, the period's financial-activity total, a collapsible super-category summary panel and the interactive timeline chart.

**Acceptance criteria**
- A returning session may preserve the user's last valid scope, range, day selection and panel state.
- The chart receives the primary available visual area; the secondary list does not dominate the screen.
- Empty/partial datasets do not produce invented financial amounts or fictitious bars.
- The screen distinguishes "financial activity" from spending-only metrics and account balances.

### TRND-002 — Overview chart composition

Overview shows daily **stacked bar segments** for included **Living spending**, included **Fun spending** and **gross Saving contributions**.

**Acceptance criteria**
- All three super-categories are identifiable by stable semantic visual identity and accessible text.
- Each day's positive stacked composition reconciles to the relevant financial facts; negative adjustments are represented without being relabelled as positive purchases.
- Savings contributions are displayed alongside spending **but are not counted as spending**, and Saving withdrawals are not treated as negative purchases or new income.
- The headline/activity total is explicitly the combination of the displayed financial activities, not a bank balance or claim about savings value.
- No pie chart or second competing primary chart appears.

### TRND-003 — Drill-down scope and chart changes

The user can navigate **Overview → Living/Fun/Saving → an individual category** and return through the same hierarchy. The selected date range is retained.

**Acceptance criteria**
- Overview graph stacks by **super-category**; its expanded panel lists **Living, Fun and Saving**, not individual categories.
- A super-category graph stacks activity by its **individual categories**; its expanded panel lists those categories.
- A single-category graph shows that category's activity over time as one series; its expanded panel lists constituent transactions.
- User-selected category colour/gradient identity is used consistently when the category is plotted; details of visual tokens belong to the future design system.
- A scope change never includes transactions from another scope and never changes classification.
- The user can navigate by tapping a breakdown row or another clearly labelled scope control. A **bar tap is reserved for selecting a date** to avoid an ambiguous gesture.

### TRND-004 — Contextual day inspection at every depth

**Every day is inspectable at every chart depth.** Selecting a bar/date focuses the supporting breakdown on **that exact local calendar date**, within the existing scope.

| Chart scope | Panel for selected day |
| --- | --- |
| Overview | Living, Fun and Saving activity **on that day** |
| Living, Fun or Saving | The selected super-category's **individual categories on that day** |
| Individual category, e.g. Restaurants | The individual matching **transactions on that day** |

**Acceptance criteria**
- The selected date is visibly highlighted on the graph and identified in the panel, with the correct date-specific total.
- Day selection **does not silently change** the selected scope or overall date-range filter; the period headline remains explicitly a period figure.
- Selecting a day when the panel is collapsed expands it to reveal the contextual breakdown; clearing the selection restores the full-range breakdown.
- A selected day with zero included activity produces a clear zero/empty view rather than stale rows from a previously selected date.
- A day outside the active range cannot remain selected after changing the range.
- Date selection behaves equivalently in the normal and expanded-chart experiences.

### TRND-005 — Supporting panel: constrained and collapsible

A contextual panel sits between the headline and graph. It is **collapsible**, has the **same consistent expanded-height constraint at all three scope depths**, and scrolls internally if its entries exceed that height.

**Acceptance criteria**
- Overview: ranked super-category rows. Super-category: ranked category rows. Individual category: chronological transaction rows.
- Ranked monetary group rows are ordered **highest amount first**, with a stable tie-breaker; transaction rows are normally **newest first**.
- An unusually long list never pushes the graph off-screen.
- Collapsing the panel **increases the chart's vertical height** by using the reclaimed space; expanding it reduces chart height without losing chart state.
- The collapsed panel retains a discoverable control and enough context to reopen it, rather than creating a competing summary dashboard.
- All rows remain readable and reachable through touch, keyboard/focus and screen-reader navigation.

### TRND-006 — Transaction inspection, not management

At individual-category depth, the supporting panel shows actual matching transactions, for the full selected range or (when selected) the focused day. This supersedes the earlier tentative exclusion of transactions from Trends.

**Acceptance criteria**
- Transaction rows show recognisable transaction identity, date and amount, with type-aware meaning for saving activity and offsets.
- The row set follows the active category, date-range, day selection and budget-inclusion semantics.
- Read-only inspection in Trends does not itself edit, reclassify, delete or rewrite records.
- Transaction management and detailed editing are owned by [Breakdown](../breakdown/FUNCTIONAL.md); a future context-preserving handoff MAY be added without redesigning the chart/panel hierarchy.
- Extremely large transaction lists are internally scrollable or virtualised within the bounded panel.

### TRND-007 — Date presets on the page

Visible period presets are **7D, 30D, 90D and 12M**. Selecting one updates the displayed range immediately. **Custom** alone launches the custom-date selector.

**Acceptance criteria**
- No separate pop-up repeats the four existing preset ranges.
- Changing range updates the headline, all graph values, breakdown rows and eligible day selection together.
- Date labels and boundaries are explicit enough that the user knows which dates are included.
- Preset semantics and inclusive local-date handling remain consistent throughout Trends.
- A previous valid custom range is retained when the user returns to Custom within a session, where possible.

### TRND-008 — Custom range picker

Custom opens a focused pop-up/sheet containing only **From**, **To**, **Cancel** and **Apply**.

**Acceptance criteria**
- Apply accepts a valid inclusive start–end date range and updates Trends.
- An end date preceding the start date is rejected with actionable feedback.
- Cancel leaves the existing Trends range unchanged.
- The pop-up does not duplicate 7D/30D/90D/12M options or introduce an alternative range-navigation system.
- A custom range is preserved when changing chart scope or orientation.

### TRND-009 — Time-series exploration

Day-level financial data is the foundation of Trends. Users can browse activity across short and long historical ranges without microscopic, unselectable bars.

**Acceptance criteria**
- All dates in the chosen range are reachable for day-level inspection; **12M does not mean 365 indistinguishable bars squeezed into a phone width**.
- The graph supports horizontal timeline navigation; selected date and viewport do not unexpectedly jump when the supporting panel opens.
- Exact monetary figures and dates are inspectable independently of bar geometry and colour.
- The chart does not silently substitute monthly totals while labelling them "daily".
- Long-range viewport, optional zoom, and whether visibly labelled weekly/monthly aggregation is used are a **component/design decision** to settle before implementation, while retaining access to individual days.
- Refunds/negative values and extreme spikes do not make ordinary days impossible to inspect.

### TRND-010 — Expanded landscape chart

An explicit Expand control opens an **immersive landscape, chart-focused view**. It should occupy a realistic phone landscape viewport, not an arbitrarily stretched portrait screen.

**Acceptance criteria**
- Expanding is a deliberate action; ordinary device rotation alone need not navigate away from portrait Trends.
- Landscape preserves selected range, scope, date and chart position where feasible.
- The graph occupies the clear majority of the available landscape view; controls are minimal but include a way to return.
- A user can still select **any day** to inspect contextual data, using a compact overlay/sheet or equivalent non-dominant treatment; it must not permanently obscure the graph.
- Leaving landscape returns to portrait Trends with the previous panel/selection state intact.
- Back, close, safe areas, system overlays and accessibility do not create a physically implausible chart layout.

### TRND-011 — Savings trends and limitations

Saving is a first-class scope within the same hierarchy as Living and Fun. In Overview it contributes its **gross contributions** to stacked financial activity. In Saving scope, the category chart and panel reveal contributions by Saving category. Separately accessible facts may include **contributed**, **withdrawn** and **net saved over the known history**.

**Acceptance criteria**
- Saving target progress remains gross contributions; withdrawals do not erase contributions.
- A cumulative/net-saved view, when presented, uses the known start of imported history and **contributions minus withdrawals**, with no fabricated opening balance.
- It is labelled **Cumulative net saved** or **Net saved since [date]**, never **Savings balance**, investment value or total assets.
- Interest, investment performance and balances held in Monzo pots or Moneybox are **not inferred** from transfer activity.
- Transfers among savings destinations must not be double-counted as new savings where both sides are represented.
- Savings withdrawals and negative net movement are understandable, even if the default positive activity bars depict gross contributions.
- The exact second visual treatment for cumulative net saved (such as a line view) remains a component/design decision; it must not replace the main activity chart by default.

### TRND-012 — Financial data integrity and cross-page consistency

The [Money Model](../../MONEY_MODEL.md) governs included/excluded events, transfers, refunds, reimbursements, splits, dates, and independent event types. Trends does not create a second calculation system.

**Acceptance criteria**
- Given the same scope and date set, numbers reconcile with Home and Breakdown for corresponding metrics.
- Income is not displayed as a Living/Fun/Saving consumption segment solely because it is a positive bank transaction.
- Excluded transactions do not contribute to V1 default chart actuals; showing excluded activity is deferred, not silently enabled.
- Refunds/reimbursements may lead to negative net activity; a visible adjustment/negative treatment is required instead of silently clipping or turning it into positive spending.
- Split portions follow the classification and aggregation rules of the Money Model without double counting their parent record.
- Unassigned categories/classifications are visibly flagged as **incomplete coverage**; the chart never silently implies a complete super-category breakdown when relevant activity cannot yet be allocated. The shared mapping/review system is owned outside Trends and must be specified with Settings.
- Local reclassification updates the affected historical trends consistently with the shared data model.

### TRND-013 — Empty, incomplete, offline and unusual states

Trends remains a trustworthy historical view with zero days, missing history, partial imports, and unusually large values.

**Acceptance criteria**
- Zero-activity days stay on the timeline and can be selected; missing/stale periods are distinguished from confirmed zeros.
- A valid empty date range produces an intelligible empty chart and no fabricated list rows.
- Previously imported local data is usable offline; sync errors do not erase valid cached history.
- Coverage warnings do not imply exact balances or full transaction history.
- All displayed currency values and totals are correct to the unit of storage/rounding defined by the shared model.

### TRND-014 — Accessibility, motion and chart focus

The visual-first page supports precise, non-gesture alternatives.

**Acceptance criteria**
- Day and category identity, amounts and selected states are accessible without interpreting colour gradients.
- All essential chart choices and day selections can be reached without pinch-only/drag-only interaction.
- Reduced-motion preferences preserve hierarchy changes, day selections, panel resizing and orientation navigation.
- Selection hit targets remain usable for small bars or sparse activity.
- Animations support comprehension but do not block chart interaction or create unexpected data changes.

## 4. Interaction/state contract

| User action | Scope | Date range | Selected day | Supporting panel |
| --- | --- | --- | --- | --- |
| Select Overview/Living/Fun/Saving | Changes | Retained | Clear if no longer meaningful | Recompute for new scope |
| Select an individual category | Narrow to category | Retained | Retain when meaningful | Transaction rows |
| Tap a particular day | Retained | Retained | Set to exact day | Expand and show that day's composition |
| Tap selected day again / Clear | Retained | Retained | Cleared | Return to full-range composition |
| Collapse / expand panel | Retained | Retained | Retained | Height changes; chart grows/shrinks |
| Select preset / custom range | Retained | Changes | Retain only if still in range | Recompute |
| Expand / exit landscape | Retained | Retained | Retained | Preserve portrait state |

An Overview bar tap **selects a day**, not an arbitrary category drill-down. To navigate down a level, the user chooses a named group from the panel or an explicit scope selector. This keeps overlapping stack segments and gestures predictable.

## 5. Illustrative acceptance journeys

1. **Overview, 30D:** inspect a daily three-colour stack. The panel shows Living/Fun/Saving totals for 30 days, ranked largest first. Tap 13 November; the graph highlights it and the panel shows that day's **three super-categories**. Select Fun from the panel; the chart now stacks Fun's constituent categories, retaining 13 November.
2. **Fun → Restaurants:** the graph plots Restaurants only. The expanded panel shows individual restaurant transactions for the range, newest first. Tap a particular date: it shows only that day's restaurant transactions and their total. Collapse the panel: the chart becomes taller. Reopen it: the same selection is retained.
3. **Landscape inspection:** expand from a 90D range. Pan the timeline, select a day and inspect the contextual breakdown without leaving the landscape chart. Exit; the portrait graph and selection are intact.
4. **Saving semantics:** contribute £900, withdraw £5,000. The activity bar shows £900 gross Saving contribution; net savings movement is **−£4,100**. It does not claim a bank balance or treat the £5,000 withdrawal as income.
5. **Incomplete mappings:** if unclassified spend prevents trustworthy Living/Fun attribution, show a visible coverage warning rather than presenting category completeness as certain.

## 6. Scope boundary and next design work

**Not V1 Trends requirements:** transaction editing, categorisation rules editing, AI predictions, investment valuations, Moneybox balances, interest inference, net-worth tracking, pie charts, a separate permanent transaction-management page, a redundant preset-range modal, or budget-target overlays inherited from the legacy monthly-chart concept.

**Items to resolve before implementing the chart components or finishing Figma:**
1. Exact 90D/12M viewport, panning and zoom/aggregation behaviour, while keeping access to every day.
2. Chart touch target and date-selection feedback, including stacked/negative segments and axis interactions.
3. Minimum/maximum expanded information-panel height, collapsed appearance and landscape contextual-inspection treatment.
4. Negative refund/reimbursement rendering, savings withdrawal/cumulative-series visuals and outlier scaling.
5. Shared Settings/category mapping and visual-identity contract, including handling unassigned items.
6. Date-range relation to the shared calendar/payday budget-period model, where applicable.
7. Cross-page handoff tests if transaction detail navigation is later introduced.

These are tracked design/technical dependencies, **not permission to reinterpret the agreed page structure**. Chart visual design, exact layout and interaction animation should be defined after Figma. Current document is a **functional input to Figma**, not implementation approval.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../../00-workflow/OWNERSHIP_MAP.md>)
- [docs/PRODUCT_SPEC.md](<../../PRODUCT_SPEC.md>)
- [docs/UX_SPEC.md](<../../UX_SPEC.md>)
<!-- GENERATED: BACKLINKS END -->
