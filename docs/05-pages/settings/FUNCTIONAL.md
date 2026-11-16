# Settings — Functional Specification

**Status:** Draft — agreed V1 page behaviour and modal flows  
**Document ID:** PAGE-SETTINGS-FUNCTIONAL  
**Version:** 0.1  
**Release:** V1

## Purpose and authority

Settings provides four focused, non-duplicated configuration destinations:

1. **Account Syncing**
2. **Colour Scheme**
3. **Categories**
4. **Budget Periods**

The Settings landing view is a short menu. **Each destination opens a modal over a blurred/dimmed Settings backdrop**, not a permanent standalone settings page. Modal size matches its task; exact materials and animation belong to Figma. This file owns Settings layout, modal-level user interactions, category-sorting UX, theme selection and budget-period picker presentation.

Dependencies: [Startup & Unlock](../startup/FUNCTIONAL.md) owns app-entry/login flows; [Local Data Architecture](../../06-engineering/LOCAL_DATA_ARCHITECTURE.md) owns sync/persistence and secure key/data handling; [Budget Periods Domain Contract](../../02-product/BUDGET_PERIODS.md) owns date boundaries; [Money Model](../../MONEY_MODEL.md) owns financial classification meaning; [Data Model](../../DATA_MODEL.md) owns persistence; [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md) owns visual-first interaction principles.

Do not reintroduce a separate allocation-default editor, general transaction search or duplicated budget-adjustment controls inside Settings. Home owns editing the current allocation. Breakdown owns transaction editing and filtering.

## SETT-001 — Four-entry menu and reusable modal behaviour

**Acceptance criteria**
- Settings displays exactly the four named sections listed above as its primary V1 entries.
- Each opens a focused modal, with background frosted/blurred and dimmed but not interactable.
- Each modal has a discoverable close/cancel affordance and preserves accessibility focus; escape/back works.
- Modal changes are not committed merely by closing an unsaved form. A destructive action requires explicit confirmation.
- Small modals do not expand to full-page arbitrarily; Categories may occupy nearly the full screen.
- Translucency and motion are optional presentation effects; reduced-motion/high-contrast modes preserve legibility and operation.
- Modals do not stack into uncontrolled nested layers when a provider authentication redirect or confirmation is needed.

## 1. Account Syncing

### SETT-002 — Connection summary and actions

Compact modal shows the current **Monzo** connection, last successful sync, and context-appropriate controls.

| State | Visible primary action |
| --- | --- |
| Not connected | Connect with Monzo |
| Connected | Sync Now |
| Syncing | Progress/status; avoid duplicate requests |
| Needs reauthorisation | Reconnect with Monzo |
| Offline/transient error | Retry; last successful sync remains visible |

**Acceptance criteria**
- Connecting/reauthorising invokes real Monzo OAuth as defined in [Startup & Unlock](../startup/FUNCTIONAL.md).
- Sync Now performs the same local sync flow as launch and never creates a separate conflicting importer.
- Every eligible authorised Monzo account and pot is in the V1 import scope; **no account selector or exclude-account control**.
- Show **Last synced** based on the last successful durable import, not merely the last attempt.
- Error messages distinguish permission/authentication failure, offline state and transient API errors without exposing secrets.
- Automatic on-launch sync is a fixed V1 behaviour, **not a duplicate on/off setting**.
- Disconnect stops future Monzo access by removing/revoking credentials where supported. It **does not automatically erase** locally encrypted history or user settings.
- Any separate deletion of local data must be explicitly destructive, with scope and consequences made clear; a general Data & Privacy fifth menu section is not part of V1 Settings.

### SETT-003 — No unnecessary banking controls

**Acceptance criteria**
- No per-account selection, scheduled background-sync configuration, webhook setup or multiple-provider configuration in V1.
- Connection status does not imply uninterrupted refresh capability: non-confidential Monzo clients can require reauthorisation.
- Bank login details are never entered into a Vibe Ledger-designed credential form.

## 2. Colour Scheme

### SETT-004 — Preset palette gallery

A medium/large modal displays a small curated gallery of **visual mini-previews** of Vibe Ledger (e.g. a miniature chart, background, headings and colour accents), not only unlabelled swatches.

The palette model has **five primary semantic colours**:
- Background
- Foreground/text
- Living
- Saving
- Fun

Supporting surfaces, dividers, borders and muted text are derived design tokens. Category-level appearance is independently configurable in Categories.

**Acceptance criteria**
- Multiple curated, accessible palettes are selectable; include both darker and lighter examples if contrast passes.
- Each option shows how an actual app component would feel, using mini visualisations/charts.
- Selecting a palette gives immediate preview feedback; one chosen palette is active across Home, Breakdown, Trends and Settings.
- Reverting/closing without confirmation follows one predictable and visibly explained rule; no half-applied theme state.
- Semantics Living/Saving/Fun stay stable even if their actual hues vary across preset palettes.
- Category-specific two-colour gradients are not overwritten by choosing a different app-wide palette without explicit user action.
- **No unrestricted theme colour wheel, five-slider editor or separate redundant light/dark toggle** in V1; advanced custom theme editing is a low-priority future feature.

## 3. Categories — a fixed-screen sorting game

### SETT-005 — Full-screen word-bank interaction

Categories opens a near-full-height portrait modal, inspired by a word-bank sorting exercise. It is **not a scrolling category settings list**.

The screen permanently contains:
- Three generously sized, **vertically stacked** drop targets: **Living, Saving, Fun**.
- A bottom **category word bank** showing a manageable batch of category chips.
- Small progress/remaining indicators and an obvious **Undo** control.
- A route to inspect/revise already assigned categories without leaving the experience.

**Acceptance criteria**
- **No scrolling anywhere inside the Categories sorting game.**
- All three drop targets remain visible simultaneously while the user sorts.
- Categories can be dragged from the bank into a bucket, with obvious hover/lift/drop feedback and restrained haptic feedback.
- Dragging is optional: tap a category and then tap a bucket is an equivalent accessible assignment method.
- Moving a category from any bucket to another works; assignment is **not permanent**.
- Unassigned categories remain in the bank or accessible via its batch navigation; completing a batch reveals more without scrolling.
- Assigned categories can be revisited via selecting a bucket to show its members in the bottom bank, with compact previous/next batch controls as needed.
- **Undo reverses the last assignment/reassignment**, restoring the previous bucket or unassigned state; multi-step undo within the editing session is supported.
- No wrong-answer scoring: category placement reflects personal budgeting preferences.
- Large category counts do not shrink chips or make bucket targets unusable; display summary counts rather than all assignments inside each bucket.

### SETT-006 — Source identity, mapping and unassigned state

For V1, the primary category names/keys are imported from Monzo's transaction `category` data and remain **read-only source labels** in this settings flow. Categories map to exactly one of **Living, Saving or Fun**, or remain **Unassigned** until reviewed.

**Acceptance criteria**
- The UI does not imply Monzo's API provides category icon/colour metadata.
- A source category that has no mapping is visibly pending review; relevant affected financial summaries must flag incomplete classification instead of silently dropping activity.
- Mapping changes re-evaluate relevant historical data using the precedence in the [Money Model](../../MONEY_MODEL.md), without overriding explicit per-transaction decisions.
- Mapping/source identity is stable when resyncing, even if the displayed label changes.
- The game does not embed transaction lists or merchant-rule editors.
- Some transfers/pots require separate **event-type and destination classification**, not naive use of an ordinary Monzo spending category; the shared classification/data model must support them and expose Needs Review without inventing their financial purpose.
- Monzo custom-category compatibility is **subject to real payload validation**; unknown source keys should be retained and reviewable, not thrown away.

### SETT-007 — Category appearance

A category can have an app-owned icon and a **two-colour gradient** with freely chosen start and end colours, including the same colour twice for a solid fill. The sorting surface stays uncluttered; selecting a category can open a compact appearance editor as an anchored overlay or mode within the existing modal, without creating a new permanent Settings page.

**Acceptance criteria**
- Category identity, super-category mapping, icon and colour pair persist locally and survive resyncs.
- Automatically selected initial appearances are provided; users need not individually design dozens of gradients.
- Category appearance is consistently recognisable in Breakdown and Trends and is not the only method of identification.
- No artificial restriction to shades of the parent super-category's palette.
- Exact colour picker, picker gestures and icon library are component/Figma decisions; do not silently replace the user's two-colour idea with five fixed swatches.
- Category edits have a clear save/cancel lifecycle or an immediately reversible undo model.

## 4. Budget Periods

### SETT-008 — One start day and automatic end

Budget Periods opens a frosted modal with **one day-of-month selector (1–31)**. The end of every period is derived by the [Budget Periods Domain Contract](../../02-product/BUDGET_PERIODS.md), not configured independently.

**Acceptance criteria**
- A chosen 25th produces 25th through 24th of the next month.
- If a month lacks the chosen day, its last day is used for that start boundary, but the user's chosen preference remains unchanged for subsequent months.
- Form has a clear Apply/Save and Cancel; previewing never mutates stored periods.
- Adjusted *start dates* are underlined subtly; end dates are not marked simply for being derived.
- A small single legend explains the underline only if needed.

### SETT-009 — Twelve-period preview

A vertically scrollable **preview contained within the Budget Periods modal** shows the current and next eleven consecutive budget periods; each row contains explicit start and inclusive end dates.

**Acceptance criteria**
- This preview may scroll **inside this modal**; the no-scrolling rule applies **only to Categories**.
- Changing the chosen start day updates all twelve preview rows immediately.
- The example covers naturally occurring 30/31-day and February transitions, including leap-year effects when the preview spans them.
- Continuity holds between every adjacent preview row without missing or repeated dates.
- Saving a new rule during an active period must follow the transition policy specified by the domain contract; where unresolved, do not pretend there is no historical impact.

## Outstanding design/implementation decisions

1. Category-batch size on small phones, bucket selection/review affordance and inline appearance editor layout — Figma/component work, **no vertical scrolling**.
2. Colour palette preset names, preview tile geometry, exact tokens and animation — Figma.
3. Budget start-day change mid-period: preserve closed periods, define and test explicit transition policy before implementation.
4. Monzo source keys versus app-defined saving/pot categories and user-created subcategories: resolve in the shared classification/data contract; do not misuse imported category labels.
5. Account disconnect/revoke protocol and native OAuth callback feasibility: integration proof needed.
6. Offline/account-auth error text and secure delete options: test before launch.

**Not V1:** account inclusion selector, arbitrary custom super-category creation, freeform app-wide theme creation, classification-rule editing inside the category game, a default allocation reset, or a new hosted application backend.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../../00-workflow/OWNERSHIP_MAP.md>)
- [docs/02-product/BUDGET_PERIODS.md](<../../02-product/BUDGET_PERIODS.md>)
- [docs/05-pages/startup/FUNCTIONAL.md](<../startup/FUNCTIONAL.md>)
- [docs/06-engineering/LOCAL_DATA_ARCHITECTURE.md](<../../06-engineering/LOCAL_DATA_ARCHITECTURE.md>)
- [docs/PRODUCT_SPEC.md](<../../PRODUCT_SPEC.md>)
<!-- GENERATED: BACKLINKS END -->
