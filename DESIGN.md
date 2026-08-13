---
name: Operator Review
description: Cursor-side PR visualizer. Chat interviews; this pane shows the current list, group, or diff.
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

A local visualizer that sits in Cursor's Simple Browser beside chat. Design serves the walk: inbox list, then diffs with a floating dock and a frosted notes overlay. Chrome matches Cursor: system UI font, compact rows, no cards, near black and white with a cool slate tint. Green and red belong to the diff only. Diff code is Fira Code with ligatures; file headers stay on the UI stack.

Physical scene: an engineer at a desk, this pane squeezed next to chat. Attention is on the conversation and the current hunk. Theme follows the system `prefers-color-scheme`: paper in light, ink in dark. Never `#fff` or `#000`. Pierre `themeType` tracks the same preference so syntax highlighting matches chrome.

## Colors

Strategy: Restrained. Neutrals are cool slate (hue 260, chroma 0.004–0.008), Cursor black and white rather than a brand hue. Tokens use `light-dark()` so the page follows the OS. Selection, focus, You, and Send use graphite slate. Ochre is Stale, and a light ochre frost on **check** overlay cards. Brick is errors. Chrome never uses green: that color is reserved for diff additions. Pierre `--diffs-light-*` / `--diffs-dark-*` are `var(--paper)` / `var(--ink)`.

## Typography

Chrome uses the platform UI stack. 12px body, 11px labels, 13px titles. Tabular numbers for `#N`. Diff lines use Fira Code (400/500, `calt` + `liga`); headers inside the diff viewer stay system-ui. No Inter, no fluid clamp headings. Prose (empty states, errors) stays under 65ch.

## Elevation

No shadows. Chrome stays matte except the floating walk surfaces (notes overlay, bottom dock, file-tree control), which share one frosted treatment (translucent panel + blur). Honor `prefers-reduced-transparency` with an opaque panel. Hierarchy is background steps (`ink` → `panel` → `raised`) and a 1px `line`. The titlebar and submit bar sit on `panel`. The inbox and diffs sit on `ink` (paper). Hover is `raised`, not a card.

## Components

- **Titlebar** (inbox only): 11px "Review" plus muted scope. The walk uses the PR title row instead; do not stack both.
- **Scope switch**: segmented, transparent, pressed state is `raised`. Not three marketing buttons.
- **PR row**: explorer-style list row. Number muted until hover; title truncates. Tags are 11px words, not pills with heavy borders.
- **Walk dock**: a floating bar at the bottom of the diffs (`‹` current group `›`). The middle control is the current step; click it for the other groups or Whole PR. Chevrons step prev/next. The dock hides while the file tree or comment popover is open.
- **Walk notes**: a frosted overlay at the top-right of the diffs. First card is the group (or PR) summary. Then **explain** cards (what this hunk is in the PR) and **check** cards (a concern: look, then comment, fix, or own). Check cards use the same frost with a light ochre fill and border. The last card is always **Done! ✅**, with a control to open the next feature group (or Whole PR). Up/down steps cards, PATCHes `activeNote`, jumps to that hunk, and blinks it (slate wash, two pulses; a single fade when `prefers-reduced-motion`). Stepping does not open the line-comment input. Footer shows Open / Owned / Waived only on checks, plus how many checks are left. Minimize collapses it to a 40px icon. A skip-to-start control left of minimize returns to the summary card. Not a second chat. Stepping is not a decision.
- **File tree**: Pierre FileTree of the current group's files. Click a file to jump to that diff. Wide: sidebar. Narrow: hidden until a bottom-right control opens a floating panel.
- **Comment popover** (narrow): appears when lines are selected. Save draft or click outside / Escape to clear the selection.
- **Submit bar**: status-bar density. Primary Send appears only when `readyToSubmit`, and stays disabled while check cards are open. **Waive remaining** is the explicit skip. Wide also holds the draft field.

## Do's and Don'ts

**Do** keep one job per width: list, or groups, or the current diff.
**Do** copy `#N` on click; do not navigate away.
**Do** use slate only for current selection, focus, You, and Send.
**Don't** use green in chrome. Additions already own that color.
**Don't** restore GitHub PR chrome (tabs, conversation widgets, review timelines).
**Don't** use cards, hero metrics, gradient text, or side-stripe accents.
**Don't** add a second chat pane. Walk notes explain and flag; they do not interview.
