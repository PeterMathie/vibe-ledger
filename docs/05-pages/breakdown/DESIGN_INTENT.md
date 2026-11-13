# Breakdown — Pre-Figma Design Intent

**Status:** Approved directional structure; **not a final design specification**  
**Document ID:** PAGE-BREAKDOWN-DESIGN-INTENT  
**Version:** 0.1

## Role

Capture decisions demonstrated by the user-approved Breakdown mockup so Figma exploration does not lose the intended structure. This is **not** authority for exact padding, colours, fonts, glass materials or animation constants. Those will be specified after Figma.

For normative behaviour see [Breakdown Functional Specification](FUNCTIONAL.md) and [Transaction Search Contract](../../04-components/features/TRANSACTION_SEARCH.md). For broad interaction principles see [Design Philosophy](../../01-philosophy/DESIGN_PHILOSOPHY.md).

## Agreed visual direction

- Match the existing **Home** reference: deep dark background, restrained translucent/outlined surfaces, refined typography, rounded components and considered accents.
- A clear **Breakdown** heading and current-period context.
- A four-way **Overview | Living | Fun | Savings** scope selector.
- Shared top budget/progress header: **Overview** shows the total budget base, while other scopes show their allocation targets.
- The header has **horizontal category-coloured segments**; unused portion is **neutral grey**.
- If over target, subsequent full budget-length rows stack beneath the first; the categories retain distinguishable identity in every row. Show factual over-target text without replacing category colours with a monochrome warning.
- **Categories | Transactions** is the only secondary view switch; **no pie charts**.
- In Categories, use simple category rows with category identity, numerical amount and share. Clicking one reveals the actual transactions for that category.
- In Transactions, present a legible chronological feed; clicking a transaction opens its details.
- Show the **Search** action only on Overview. Its builder appears in an Apple-like **frosted/translucent floating modal** against a blurred/dimmed background, but readability always wins over effect.
- The search modal starts with four compact headings: Category, Date, Amount and Text, each with **+ Add**. Multiple conditions stack inside their group.
- For **About** amounts: compact approximately five-digit amount field, tolerance slider on the **same row**, and calculated min/max range below.
- Savings displays contributions, withdrawals and net movement concisely. **No large explanatory paragraph or card** explaining bank transaction signs.
- Minimise redundant labels, duplicate summaries and filler so the screen feels like a focused financial instrument rather than an analytics dashboard.

## Relationship to reference images

The approved image mockup establishes mood and broad composition, **not exact numerical data or consistent category totals**. All example amounts are illustrative and must be replaced by coherent test fixtures during Figma/Flutter work.

Some generated mockups accidentally show outdated bottom navigation labels (e.g. Settings or Savings) and inconsistent category colours. **These are not approved product decisions.** Refer to the authoritative product/navigation specs for the app's actual destinations and the current design philosophy for colour semantics.

## Figma questions still open

- How to make many category segments individually distinguishable without excessive colours or legends, including accessibility and tiny categories.
- How to represent negative category totals/refunds and category composition above 100%, while keeping bars mathematically honest.
- Whether category expansion or transaction details use inline expansion, a bottom sheet or another accessible container when content is lengthy.
- How much of the budget header remains visible on long-scrolling lists.
- Glass blur, motion, contrast, touch targets, typography and dark/light appearance.
- Handling of tiny viewports, large text, extremely long merchant/category names and 100+ transactions.

Do not formalise the design tokens or reusable visual component system until Figma has validated these choices.

<!-- GENERATED: BACKLINKS START -->
## Used by

- [docs/00-workflow/OWNERSHIP_MAP.md](<../../00-workflow/OWNERSHIP_MAP.md>)
- [docs/05-pages/breakdown/FUNCTIONAL.md](<FUNCTIONAL.md>)
- [docs/UX_SPEC.md](<../../UX_SPEC.md>)
<!-- GENERATED: BACKLINKS END -->
