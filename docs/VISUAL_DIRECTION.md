# Visual Direction

This document translates the original Budget Layers showcase into maintainable
Vibe Ledger product direction. It is visual and interaction guidance only.
`MONEY_MODEL.md` and `ACCEPTANCE_SCENARIOS.md` remain authoritative for money
semantics.

## Product character

Vibe Ledger is not a generic fintech card dashboard. Its defining story is:

1. **Plan** — show how this month's budget base is allocated.
2. **Current position** — show what is left, over, or still to contribute.
3. **Pace and history** — show when and where the result was produced.

Decoration is subordinate to those three questions. The primary presentation is
dark, dense, calm, and numeric. A system light theme may adapt surfaces and
contrast, but must preserve hierarchy and semantics.

## Colour semantics

| Meaning            | Dark-theme reference | Rule                                 |
| ------------------ | -------------------- | ------------------------------------ |
| Background         | `#0B0F15`            | Quiet canvas                         |
| Surface            | `#131A24`            | Group related information            |
| Divider            | `#2B3543`            | Structure without visual noise       |
| Living             | `#6FA8FF`            | Super-category identity only         |
| Saving             | `#A886FF`            | Super-category identity only         |
| Fun                | `#56D3AE`            | Super-category identity only         |
| Target breach      | `#FF6868`            | Red is reserved for an actual breach |
| Supporting warning | `#EFB35D`            | Secondary caution, never breach      |

Colour never carries status alone. Every allocation prints its name, actual,
target, percentage, and `left`, `over`, or `to go` text.

## Home hierarchy

The monthly allocation is the primary Home object, not a secondary metadata
line. Group together:

- active month and budget base;
- the explicit ratio composition, such as `50% / 30% / 20%`;
- Living, Saving, and Fun target amounts;
- a single composition visual using the three identity colours.

Current position follows immediately. Living and Fun use `left` or `over`.
Saving uses contribution progress and `to go`, with net savings movement on a
separate line. These values always drill to the exact Breakdown/Explorer
filter.

Pace/history comes after the plan and position. Home includes the full calendar
heat map and exact-date drill-down. Living and Fun use proportional wrapping
runover rows; extreme runover preserves its physical scroll length while
virtualising rendered rows.

## Breakdown / Explorer hierarchy

Breakdown should read as a hierarchy:

- selected period and included/excluded summary;
- Living, Saving, and Fun as the first level;
- categories ordered by contribution within each super-category;
- amount and proportion for each category;
- merchant/transaction children indented beneath their category;
- explicit type, inclusion, exclusion, split, and review status.

Neutral activity, income, transfers, withdrawals, and exclusions remain visible
even when they do not contribute to the primary included-spend total.

## Primary destinations

The product has four deliberate destinations:

- **Home**
- **Breakdown**
- **Trends**
- **Subscriptions**

Layers may expose unavailable destinations as clearly disabled future
affordances, but must not fake their content. Settings and experimental views
are subordinate, not primary navigation.

## Current and deferred showcase elements

The interactive allocation ring, exact numeric editor, proportional runover,
calendar heat map, hierarchical Breakdown, deterministic search/corrections,
and Trends charts are implemented in the synthetic app. Trends preserves
explicit semantic measures, stored historical targets, grouped stacks, and
canonical Breakdown drill-downs. Subscription management and the experimental
Money Map remain later layers. Their implementations must reuse the same typed
filters and preserve this hierarchy rather than introduce a new generic
dashboard language.
