---
name: Operator Review
description: Static PR review walkthrough. Evolving diagrams, the diffs that prove them, and a notes overlay.
colors:
  paper: "oklch(0.97 0.004 260)"
  paper-panel: "oklch(0.94 0.005 260)"
  ink: "oklch(0.18 0.005 260)"
  ink-panel: "oklch(0.22 0.005 260)"
  text-light: "oklch(0.25 0.008 260)"
  text-dark: "oklch(0.92 0.004 260)"
  text: "oklch(0.25 0.008 260)"
  raised: "oklch(0.91 0.005 260)"
  muted-light: "oklch(0.48 0.008 260)"
  slate: "oklch(0.32 0.012 260)"
  slate-dim: "oklch(0.32 0.012 260 / 0.1)"
  ochre: "oklch(0.52 0.12 85)"
  brick: "oklch(0.5 0.14 25)"
typography:
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
  code:
    fontFamily: "Fira Code, ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  button-hover:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
  button-primary:
    backgroundColor: "{colors.slate}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  pr-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  pr-row-hover:
    backgroundColor: "{colors.raised}"
  tab-active:
    backgroundColor: "{colors.slate-dim}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
---

## Overview

A static local page, opened from `file://` in a browser tab or Cursor's Simple Browser. Design serves the walk: a sidebar of steps, an evolving diagram with the diffs that prove it below, a frosted notes overlay, and a floating dock. Chrome matches Cursor: system UI font, compact rows, no cards, near black and white with a cool slate tint. Diff code is Fira Code with ligatures; file headers stay on the UI stack.

Physical scene: an engineer at a desk, reviewing one or several PRs at their own pace. Attention is on the current diagram and hunk. Theme follows `prefers-color-scheme` (paper in light, ink in dark) unless the reader forces Light or Dark with the theme switch. Never `#fff` or `#000`. Pierre diffs inherit the page's `color-scheme`, so syntax highlighting matches chrome.

## Colors

Strategy: Restrained chrome, expressive diagrams. Neutrals are cool slate (hue 260, chroma 0.004–0.008), Cursor black and white rather than a brand hue. Tokens use `light-dark()`. Selection, focus and the line lens use graphite slate. Ochre marks open checks and questions, and tints **check** overlay cards. Brick is errors, BREAKING and change-requesting verdicts. Pierre `--diffs-light-*` / `--diffs-dark-*` are `var(--paper)` / `var(--ink)`.

Diagram nodes are the one place chrome carries hue: `new` is blue, `risk` red, `fix` green with a dashed border, `gone` muted and dotted, each with its own light and dark shade. Elsewhere, green belongs to diff additions only.

## Typography

Chrome uses the platform UI stack. 12px body, 11px labels, 13px titles. Tabular numbers for step positions and counts. Diff lines use Fira Code (400/500, `calt` + `liga`); headers inside the diff viewer stay system-ui. No Inter, no fluid clamp headings.

## Elevation

No shadows. Chrome stays matte except the floating walk surfaces (notes overlay, dock, substep picker), which share one frosted treatment (translucent panel + blur). Honor `prefers-reduced-transparency` with an opaque panel. Hierarchy is background steps (`ink` → `panel` → `raised`) and a 1px `line`. The sidebar sits on `panel`; the stage sits on `ink` (paper). Hover is `raised`, not a card.

## Components

- **Sidebar head**: storyboard title (13px) and muted subtitle, then a small outlined **Open PR #N ↗** button (11px, hairline border, raised on hover) for the current step's PR, with the theme switch (System → Light → Dark) at the right. On narrow widths it is the only part of the sidebar left.
- **Step rows**: explorer-style list. Step rows show number, kicker and title, with the verdict as an 11px word underneath. Substep rows are muted until seen or active, show their open count in ochre, and end with one 5px circle per card (mid grey; the current card's circle is darker in light mode, lighter in dark).
- **Ledger**: status-bar density at the sidebar foot: open and to-review counts, and **Reset**.
- **Stage**: the diagram on top (reserving room for the overlay on wide screens), the legend as 11px words with swatches, then the Pierre diffs for the substep.
- **Walk notes**: a frosted overlay at the top-right of the stage. First card is the substep summary (title, body, BREAKING). Then **explain** cards (what this hunk is in the PR), **check** cards (a concern, ochre-tinted), **question** cards (a decision for the reviewer), and no done card: the next arrow goes straight to the next substep, and past the last card, to the review list. Checks and questions carry two quiet buttons, **Safe** and **Review**; the pressed one fills (slate for Safe, ochre for Review). A pen button in the header (or `n`) opens a note box at the foot of any card: a plain textarea that saves as you type. A saved note sits there as a quote with a slate left bar. Arrows and the dock step cards; a card with a line scrolls to it, blinks it (slate wash, two pulses; a single fade when `prefers-reduced-motion`) and keeps a slate bar on it; a card with a node dims the rest of the diagram. Minimize collapses it to a 40px icon. Not a second chat.
- **Review list**: replaces the diagram, diffs and overlay in the stage. An 860px column of flat rows under Your notes, To review, Still open (when any) and Safe headings (11px caps with counts), divided by hairlines and not boxed. Each row has a kind tag, the substep as a jump link, the text, a muted detail, and a foot with the monospace GitHub line link and the Safe/Review buttons. Note rows quote the note with a slate left bar and add Edit; only notes on checks and questions carry a link and the buttons.
- **Walk dock**: a floating bar at the bottom of the stage (`‹` current substep `›`). The middle control opens a picker of every substep, grouped by step.

## Do's and Don'ts

**Do** keep the reviewer in control: no autoplay, every move is a keypress or click.
**Do** use slate only for current selection, focus and the line lens.
**Don't** use green in chrome outside diagram fix nodes. Additions own that color.
**Don't** restore GitHub PR chrome (tabs, conversation widgets, review timelines).
**Don't** use cards, hero metrics, gradient text, or side-stripe accents.
**Don't** turn the overlay into a quiz. Notes explain and flag; questions ask for a decision, not a known answer.
