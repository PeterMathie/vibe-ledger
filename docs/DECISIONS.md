# Product Decisions

## Locked for beta

- Product name: **Vibe Ledger**.
- Primary super-categories: Living, Saving, Fun.
- Monthly allocation ratios total 100%.
- Categories sit below super-categories.
- Saving is an allocation target, not ordinary spending.
- Saving target progress is **gross current-month saving contributions**.
- Net savings movement is a separate secondary metric.
- Savings withdrawals are not income.
- Saving contributions are not spending.
- Internal transfers are neutral.
- User-controlled budget exclusion is explicit.
- Excluded events remain visible/searchable.
- The default heat map includes budget-included Living + Fun spend only.
- No separate calendar page.
- Explorer is the canonical detail/database page.
- Heat-map cells and chart segments deep-link into Explorer.
- Trends uses stacked monthly bars and historical targets.
- Multiple super-categories use grouped stacked bars.
- Search is deterministic; interpreted filters are always visible.
- Subscription monthly equivalents are analytical, not synthetic transactions.
- Subscription reserve calculations are optional and do not alter budget actuals in beta.
- No AI in beta.
- Money Map is experimental.
- Milestones/gamification are future work.

## Deliberate limitations

- Credit-card purchase analysis is incomplete unless underlying card purchases are imported.
- The app does not infer which old savings pot funded a later purchase.
- The app does not automatically judge whether spending matches a pot's intended purpose.
- Seamless local-only Monzo auth may not be achievable without a minimal companion service.

## Decisions to revisit only after beta usage

- Whether Saving target should switch from gross contributions to net contributions.
- Whether excluded spending should have a heat-map toggle.
- Whether Money Map deserves dashboard space.
- Whether subscription reserves should integrate into Living actuals.
- Whether more than three super-categories are useful.
- Whether payday-to-payday periods are preferable to calendar months.
