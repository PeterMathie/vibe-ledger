# Trends — Functional Specification

**Status:** Draft — agreed page behaviour for product/design review  
**Document ID:** PAGE-TRENDS-FUNCTIONAL  
**Version:** 0.2  
**Planned release:** V1

## 1. Purpose and authority

Trends answers **"How has my financial activity changed over time, and what makes up each time interval?"**

The **interactive timeline chart is the primary feature**. Supporting facts and lists are subordinate, collapsible and contextual. The page has **three chart levels**: **L1 All (super-category segments) → L2 selected super-category (category segments) → L3 selected category (individual transaction segments)**. The user can inspect the transactions within any represented time interval, down to individual days, without replacing the primary chart.

This specification owns Trends page states, time shortcuts and freely navigable viewport, chart-level navigation, contextual interval inspection, morphing chart transitions, chart-versus-panel layout and landscape expansion. It **does not** redefine financial event classification, saving contributions, withdrawals, refunds, budget scope, category ownership or historical period calculation. Those belong to the [Money Model](../../MONEY_MODEL.md). It references the [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md) for visual-first hierarchy and the [Home](../home/FUNCTIONAL.md) and [Breakdown](../breakdown/FUNCTIONAL.md) contracts for shared context and page boundaries.

The older Trends sections in [Product Specification](../../PRODUCT_SPEC.md) and [UX Specification](../../UX_SPEC.md) are migration references, **not competing V1 chart or interaction requirements**. Exact geometry, colour tokens, animation curves/durations, gesture thresholds and Figma frames are deferred to component/design work; **continuous temporal zoom, fixed display-width bars, animated hierarchy morphing and bar-segment navigation are agreed functional behaviours**, not optional experiments.

## 2. Page structure and conceptual model

- **Primary:** prominently sized time-series chart with date and monetary scales, a prominent figure for the active scope and date range, and unobtrusive chart expansion.
- **Hierarchy:** L1 **All** (Living/Fun/Saving stacks); L2 **Living, Fun or Saving** (category stacks); L3 **individual category** (transaction stacks). Income is an event type, **not a fourth super-category**.
- **Time:** retain directly accessible shortcuts **7D, 30D, 90D, 12M** plus **Custom**. They set a time viewport, **not a permanent restriction on subsequent pinch zoom or pan**. A **Fit All** action frames from the earliest available data to today. Time scale and hierarchy depth are independent.
- **Supporting panel:** a fixed maximum-height, internally scrollable, **collapsible** breakdown immediately beneath the headline and **above** the chart.
- **Orientation:** portrait Trends plus intentional full-screen **landscape chart**.
- **Interval focus:** a selected bar represents its actual labelled time bucket (day, week, month, etc.). The panel shows that bucket's composition; clearing the selection shows the **currently visible time window**. Users can zoom down to a single-day bucket.

The chart stays physically below the information panel in portrait, including at individual-category depth. The chart is never displaced by an unbounded transaction list. See the [Money Model](../../MONEY_MODEL.md) for the meaning of amounts; Trends' "financial activity" combines spending with contributions **without identifying contributions as spending**.

## 3. Requirements and acceptance criteria

### TRND-001 — Default state and clear hierarchy

Default entry shows **All**, a useful recent time viewport (30D unless a previous valid viewport was retained), the current viewport's financial-activity total, a collapsible super-category summary panel and the interactive timeline chart.

**Acceptance criteria**
- A returning session may preserve the last hierarchy path, viewport, temporal aggregation, selected interval and panel open/closed state.
- The chart receives the primary available visual area; the secondary list does not dominate the screen.
- Empty/partial datasets do not produce invented financial amounts or fictitious bars.
- The screen distinguishes "financial activity" from spending-only metrics and account balances.
- "All" is the L1 hierarchy label; "Fit All" is a **time** action. They are different controls.

### TRND-002 — All/L1 chart composition

**All** shows stacked bars for included **Living spending**, **Fun spending** and **gross Saving contributions** aggregated into the chosen time buckets. At daily zoom each bar represents one local calendar day; at broader zoom, a bar represents an explicitly labelled larger interval.

**Acceptance criteria**
- All three super-categories are identifiable by stable semantic visual identity and accessible text.
- Each bucket's positive stacked composition reconciles to the relevant financial facts; negative adjustments are represented without being relabelled as positive purchases.
- Savings contributions are displayed alongside spending **but are not counted as spending**, and Saving withdrawals are not treated as negative purchases or new income.
- The headline/activity total is explicitly the combination of the financial activities within the **visible time window**, not a bank balance or claim about savings value.
- No pie chart or second competing primary chart appears.

### TRND-003 — Three-level hierarchy and drill-down

The user can navigate **L1 All → L2 Living/Fun/Saving → L3 individual category**, and return through named clickable breadcrumbs. The horizontal viewport, bar aggregation and selected interval are retained when changing hierarchy depth.

**Acceptance criteria**
- **L1 All**: each stacked segment denotes a **super-category**; the expanded panel lists Living, Fun and Saving.
- **L2 super-category**: each stacked segment denotes an **individual category** within that super-category; panel lists those categories.
- **L3 category**: each stacked segment denotes an **individual transaction** occurring in that time bucket; panel lists the actual transactions. One transaction in a bucket means a one-segment bar, not a new chart type.
- Each L3 segment has a stable transaction identity; multiple transactions on the same day stack together without merging unrelated transactions into an anonymous single colour.
- At L3 there is **no fourth chart level**. Selecting an individual transaction can open **read-only Transaction Details**, subject to consistent navigation and accessible alternatives.
- User-selected category visual identity is reused consistently; transaction-level segments may use derived/distinguishable shades/labels without inventing source category colours.
- A hierarchy change never changes stored classifications or jumps the horizontal time axis.
- Selecting a named row in the panel navigates **immediately** to its child level. Selecting a breadcrumb navigates back to the named ancestor, preserving time context.
- Tapping the first time on a bar **selects that bar's interval** without drilling. Tapping a **specific segment of the already-selected bar** drills into the corresponding super-category/category; in L3 it inspects the matching read-only transaction. Selecting another bar changes the focused interval rather than zooming hierarchy.
- This two-stage bar gesture avoids accidental drill on dense stacks; panel rows provide an accessible one-action shortcut.

### TRND-004 — Contextual interval inspection at every depth

The selected bar identifies an exact **local date interval**, not necessarily a single day. The panel shows the matching lower-level detail within that interval. At daily zoom, this is a single local calendar day.

| Chart level | Panel for selected interval |
| --- | --- |
| L1 All | Living, Fun and Saving activity within the interval |
| L2 Living/Fun/Saving | Constituent categories within the selected super-category and interval |
| L3 individual category | Matching **individual transactions** within the interval |

**Acceptance criteria**
- The selected interval is visibly highlighted and clearly labelled with inclusive dates and interval-specific total.
- Selecting a bar changes **only** the focus; it does not change the active hierarchy or time viewport. The headline is labelled as the **visible viewport's** financial activity, while panel values are interval-specific.
- Selecting an interval when the panel is collapsed expands it and reveals the relevant breakdown; clearing selection restores breakdown for the visible time window.
- When a time zoom changes aggregation granularity, selection resolves deterministically to the time bucket containing the focused day, or clears when no longer visible. Never attribute a previous single-day total to a weekly/monthly bucket.
- A focused bucket with zero included activity produces a clear zero/empty view rather than stale entries.
- An interval outside the new viewport cannot remain selected after applying a shortcut, custom range or Fit All.
- Exact day inspection is available by zooming in to daily buckets; selection behaves equivalently in portrait and landscape.

### TRND-005 — Supporting panel: constrained, collapsible and navigable

A contextual panel sits between the headline and graph. It has a constrained expanded height at all levels and scrolls **internally** if entries exceed that height. It provides **breadcrumbs (All → selected super-category → selected category)** and an optional focused-interval label.

**Acceptance criteria**
- L1: ranked super-category rows; L2: ranked category rows; L3: chronological individual transaction rows.
- Rows are ranked **highest amount first** for grouped financial activity, with stable tie-breakers; transaction rows are normally **newest first**.
- Tapping an L1/L2 row drills one level deeper, retaining the selected time interval and viewport. At L3, tapping a transaction opens read-only details (where available), not another chart level.
- Breadcrumbs allow jumping directly to any ancestor; the hierarchy never has to be re-traversed through successive back buttons.
- An unusually long list never pushes the graph off-screen.
- Collapsing panel **increases chart vertical height** using reclaimed space, but never changes hierarchy path, selection or temporal viewport. Expanding reverses the layout change.
- The collapsed state retains a discoverable expand control and breadcrumb/level context; the chart remains usable while the panel is collapsed.
- All rows and breadcrumbs are readable and reachable through touch, keyboard/focus and screen-reader navigation.

### TRND-006 — Transaction inspection, not management

At L3 individual-category depth, the supporting panel shows actual matching transactions for the **visible time window**, or (when a bar is selected) its **focused time interval**. This supersedes the earlier tentative exclusion of transactions from Trends.

**Acceptance criteria**
- Transaction rows show recognisable transaction identity, date and amount, with type-aware meaning for saving activity and offsets.
- The row set follows the active category, visible time viewport, focused interval and budget-inclusion semantics.
- Read-only inspection in Trends does not itself edit, reclassify, delete or rewrite records.
- Transaction details in [Breakdown](../breakdown/FUNCTIONAL.md) are **read-only in V1**; a future context-preserving inspection handoff MAY be added without redesigning the chart/panel hierarchy.
- Extremely large transaction lists are internally scrollable or virtualised within the bounded panel.

### TRND-007 — Retained time shortcuts

**Keep the visible shortcuts 7D, 30D, 90D, 12M and Custom.** Shortcuts instantly frame the recent requested duration ending today, and the chart chooses an appropriate time aggregation so fixed-width bars remain tappable.

**Acceptance criteria**
- **7D, 30D, 90D and 12M remain visible, direct-access shortcuts**; none is removed to make space for pinch zoom.
- Selecting a shortcut recentres/rescales the time viewport to its specified dates and updates the headline, panel and chart consistently.
- A shortcut is a **starting viewport**: the user may subsequently pan or pinch to another span or historical period without being artificially clipped to the shortcut.
- After manual time pan/zoom, do not falsely mark a previous preset as still representing the current viewport; show a neutral/custom navigated state.
- **Custom** alone launches the explicit From/To picker. **Fit All** is a separate immediate time-framing action, not a fifth modal or another hierarchy level.
- No separate pop-up repeats the shortcuts, and all time labels accurately state what the bars currently represent.

### TRND-008 — Custom viewport range picker

Custom opens a focused pop-up/sheet containing only **From**, **To**, **Cancel** and **Apply**.

**Acceptance criteria**
- Apply accepts a valid inclusive start–end date range and frames the viewport accordingly.
- An end date preceding the start date is rejected with actionable feedback.
- Cancel leaves the existing Trends time viewport unchanged.
- The pop-up does not duplicate 7D/30D/90D/12M or introduce a separate chart mode.
- The last chosen Custom bounds remain available within a session, if possible.
- Changing hierarchy or orientation retains the currently displayed time viewport, including one previously set by Custom.

### TRND-009 — Fixed-width bars, continuous time zoom and pan

**Bar display width remains fixed (subject to device layout); the amount of calendar time represented by each bar changes as the user stretches or shrinks the time axis.** The chart is backed by day-level effective data. As the time viewport broadens, bars aggregate multiple days; as it narrows, aggregation resolves progressively toward individual days.

**Acceptance criteria**
- Horizontal pinch **stretches/shrinks the time axis**. Horizontal drag **pans** through existing data. Zoom uses a stable focal date (e.g. under the fingers or chart centre) rather than jumping to today.
- Keep bars a practical, consistent on-screen width across time zoom scales; use explicitly labelled adaptive buckets (day, week, month, quarter/year as needed), not 365 microscopic daily bars on one phone screen.
- Bucket boundaries and labels are calendar-aware and deterministic; uneven month lengths, leap years and daylight saving are handled without overlapping or missing event dates.
- Bars at any granularity are built from the **same effective transactions**; grouped totals equal the sum of corresponding daily values and reconcile to Breakdown.
- The current **visible time viewport**, its bucket granularity and any focused interval are tracked independently from hierarchy level. Pan/zoom does not reset All/Living/Fun/category path.
- Zoom can reach **single-day resolution** and the widest **earliest imported data through today** view. An explicit Fit All action frames that full available history.
- The user can inspect any day by zooming towards it; long-history aggregation must never destroy the ability to find individual transaction dates.
- Headline and unfocused panel reflect the **visible time window** after pan or zoom, rather than a stale previously selected 30D/12M window.
- Exact monetary figures and dates are inspectable independently of bar geometry/colour. The chart never labels aggregated monthly or weekly totals "daily".
- Manual pan/zoom is not an implicit Custom picker action; presets and Custom remain available for deliberate reframing.
- Refunds/negative values and extreme spikes do not make ordinary activity impossible to inspect.
- Native pinch is not the only way to zoom: an accessible alternative (zoom controls/keyboard equivalents) must exist.

### TRND-010 — Expanded landscape chart

An explicit Expand control opens an **immersive landscape, chart-focused view**, retaining the same three-level hierarchy and time navigation mechanics. It occupies a realistic landscape phone viewport, not an arbitrarily stretched portrait screen.

**Acceptance criteria**
- Expanding is deliberate; ordinary device rotation alone need not navigate away from portrait Trends.
- Landscape preserves hierarchy path, time viewport, bucket granularity, focused interval and chart position where feasible.
- The graph occupies most of the landscape view, with minimal visible controls and a way to return.
- The user can pinch/zoom/pan, inspect selected intervals and drill hierarchy in landscape too; a compact contextual overlay/sheet must not permanently obscure the graph.
- Leaving landscape returns to portrait with previous panel and chart state intact.
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
- Time-interval, super-category, category and transaction identity, amounts and selected states are accessible without interpreting colour gradients.
- All essential chart choices, hierarchy changes, bucket selections and time zoom levels can be reached without pinch-only/drag-only interaction.
- Reduced-motion preferences preserve understandable hierarchy changes, interval selections, panel resizing and orientation navigation without forced animated motion.
- Selection hit targets remain usable for small/dense segments or sparse activity; panel rows provide a precise alternative.
- **Hierarchy transitions are geometrically continuous:** all visible bars retain horizontal positions while nonselected sibling segments recede, the parent segment divides into its child stacks, bar heights interpolate to the new totals and the vertical axis rescales smoothly. Zooming out reverses the merge. The panel and breadcrumbs update in sync.
- Animations are interruptible/reversible, avoid disruptive chart resets and honour reduced motion; target durations/easing and rendering implementation belong to Figma/component work.

## 4. Interaction/state contract

The chart keeps these **independent** state dimensions: (1) hierarchy path, (2) visible time viewport, (3) time-bucket aggregation, (4) focused interval, (5) panel expanded/collapsed, (6) portrait/landscape presentation. A preset is a viewport shortcut, not an additional hierarchy level.

| User action | Hierarchy | Time viewport / aggregation | Focused interval | Supporting panel |
| --- | --- | --- | --- | --- |
| Tap an unselected bar once | Retain | Retain | Select the whole bar interval | Expand and show that interval's lower-level rows |
| Tap a specific segment of selected bar | Drill to segment child (L1/L2); inspect transaction at L3 | Retain | Retain | Update to children/transaction details |
| Tap named panel row | Drill directly to child, or inspect read-only transaction at L3 | Retain | Retain when meaningful | Update immediately |
| Tap ancestor breadcrumb | Return to selected ancestor | Retain | Retain when meaningful | Show appropriate grouping |
| Tap a different bar | Retain | Retain | Focus new interval | Update to new interval composition |
| Clear focused interval | Retain | Retain | None | Return to visible-window breakdown |
| Collapse / expand panel | Retain | Retain | Retain | Adjust available chart height |
| Tap 7D / 30D / 90D / 12M | Retain | Reframe and choose appropriate bucket duration | Remap if still visible, else clear | Recompute |
| Apply Custom | Retain | Reframe to chosen From/To | Remap or clear | Recompute |
| Pinch time axis / horizontal pan | Retain | Zoom/pan, adapt buckets as needed | Remap or clear | Recompute for actual visible window |
| Fit All | Retain | Earliest imported data → today, aggregate to fit | Remap or clear | Recompute |
| Enter/exit landscape | Retain | Retain | Retain | Show contextual overlay in landscape |

**Gestures are intentionally unambiguous:** the first tap selects an interval; tapping a segment of that **already-focused** bar drills one level. Panel rows bypass the first tap; breadcrumbs move upward. At L3, a transaction segment/row opens read-only details, not an L4 chart. Grouping changes due to time zoom are distinct from hierarchy drill.

## 5. Illustrative acceptance journeys

1. **All, 30D shortcut:** see a daily stack with Living, Fun and Saving. Tap 13 November to select that day, then tap its Living segment to drill into Living category stacks, retaining the same day, viewport and bar width. Tap Bills in the panel to drill into Bills transaction stacks. Tapping All in the breadcrumb returns to L1 without changing time.
2. **Bills transaction drill:** on 1 October, two classified Bills transactions (£200 Scottish Power, £166 Edinburgh Council) form one £366 transaction stack. On 5 October, £33 BT makes one single-segment stack. Both can be inspected as read-only transactions. Parent category and super-category stacks animate smoothly into/out of these component stacks; no L4 chart appears.
3. **Zoom from 12M:** tapping 12M fits twelve months with readable aggregated fixed-width bars. Pinch around a particular historical month until the bucket becomes a day; zoom out and eventually Fit All to see earliest imported data through today. Super-category/category path remains unchanged; labels never call monthly buckets "days".
4. **Panel collapse + hierarchy:** collapse while viewing Fun → Coffee; the chart grows vertically without losing the selected interval. Tap a Coffee transaction segment to inspect it; return to the chart, reopen panel, and navigate back to All using breadcrumbs.
5. **Landscape inspection:** expand from 90D, pan the timeline and select a time bucket. Drill into a category without losing the viewport; exit landscape and recover the previous portrait panel state.
6. **Saving semantics:** contribute £900, withdraw £5,000. Activity bars show £900 gross Saving contributions; net saving movement is −£4,100, not income nor a bank balance.
7. **Incomplete mappings:** if unclassified spend prevents trustworthy Living/Fun attribution, show a coverage warning rather than implying the three-colour stack represents all financial activity.

## 6. Scope boundary and next design work

**Not V1 Trends requirements:** transaction editing, categorisation rules editing, AI predictions, investment valuations, Moneybox balances, interest inference, net-worth tracking, pie charts, a separate permanent transaction-management page, a redundant preset-range modal, or budget-target overlays inherited from the legacy monthly-chart concept.

**Items to resolve before implementing the chart components or finishing Figma:**
1. Exact bucket-width pixels, calendar bucket boundaries across zoom transitions, pinch snapping/easing and aggregation breakpoints; **fixed-width bars, continuous zoom, time shortcuts and Fit All are already decided**.
2. Detailed hit target and tap-selection feedback for thin stacked/negative segments, including transaction identity and accessible alternatives.
3. Exact parent-child geometry interpolation, duration and easing, and how to handle dense stacks during animation, while preserving continuity and interruptibility.
4. Minimum/maximum supporting-panel height, collapsed appearance and landscape inspection overlay.
5. Negative refund/reimbursement rendering, Saving withdrawal/cumulative-series visuals and outlier scaling.
6. Shared Settings/category mapping and visual identity contract, including unassigned items.
7. Date-range relation to calendar/payday budget periods where applicable, without conflating arbitrary Trends viewports with budget periods.
8. Cross-page read-only Transaction Details handoff tests if introduced.

These are tracked design/technical dependencies, **not permission to reinterpret the agreed page structure**. Chart visual design, exact layout and interaction animation should be defined after Figma. Current document is a **functional input to Figma**, not implementation approval.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../../00-workflow/OWNERSHIP_MAP.md>)
- [docs/06-engineering/LOCAL_DATA_ARCHITECTURE.md](<../../06-engineering/LOCAL_DATA_ARCHITECTURE.md>)
- [docs/PRODUCT_SPEC.md](<../../PRODUCT_SPEC.md>)
- [docs/UX_SPEC.md](<../../UX_SPEC.md>)
<!-- GENERATED: BACKLINKS END -->
