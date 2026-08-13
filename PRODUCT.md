# Product

## Register

product

## Users

An engineer assigned as a GitHub reviewer, sitting in Cursor with chat on one side and this visualizer in a squeezed Simple Browser. They review in this pane. They type in chat when they want more context or help on a comment. They do not come here to browse GitHub.

## Product Purpose

Show the operator the PRs they are involved in, then the **feature** they are walking and its diffs. Success is that they can complete a review mostly from the overlay — explain cards for orientation, check cards for the bits that matter — and only use Cursor chat when they need a question answered or a comment drafted. This pane holds the walk cursor and a ledger of open checks. Not a second interviewer.

## Brand Personality

Quiet, precise, secondary. Voice is labels, numbers, short explain cards, and sparse check flags. The pane recedes so Cursor and the diffs can lead.

## Anti-references

- GitHub.com pull-request pages (tabs, conversation threads, review widgets)
- SaaS dashboards (cards, hero metrics, identical icon grids)
- Generic dark-mode code tools (neon accents, glass, terminal cosplay)
- A second AI chat competing with Cursor
- A quiz that the reviewer must pass

## Design Principles

- Overlay is the map (explain) and the flags (check). Chat is on demand.
- Overlay and dock move the cursor; they do not record a decision.
- One job per width: list, or groups, or the current diff. Do not restore overview when the pane is narrow.
- Chrome matches Cursor density and familiarity, then gets out of the way.
- Diffs are the product; tags, trees, and threads are optional context.
- Copy a number, don't navigate away.

## Accessibility & Inclusion

Good enough for a local tool: readable contrast, visible keyboard focus, no information carried by color alone. Formal WCAG AA is not a ship gate. Honor `prefers-reduced-motion`.
