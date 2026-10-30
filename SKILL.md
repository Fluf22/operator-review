---
name: operator-review
description: Builds a local PR review walkthrough where Mermaid diagrams evolve step by step (before → change → review finding → suggested fix), rendered with Pele, with Pierre diffs under each diagram, explain/check notes anchored to diff lines, and a few reviewer questions. Handles one PR (steps are areas of the change) or several PRs (one step per PR, in stack or merge order). Use when the user says /operator-review, or wants to review, explain or present pull requests through evolving or animated diagrams, a storyboard, a slide-like walkthrough, or mentions pele.run. For a single static diagram to embed in a PR description, use pr-lens instead.
disable-model-invocation: true
---

# Operator review

The output is one static local page, styled per [DESIGN.md](DESIGN.md). Each **step** is a row in the sidebar, and each **substep** is one diagram, optionally with the diffs that prove it. Pele renders the diagram and the page animates it in: unchanged nodes first, then tagged nodes, each edge drawing once both ends are visible. `new` nodes are blue, `risk` red and `fix` green. After the entrance, `new` nodes glow once, `risk` nodes pulse, `fix` nodes get marching borders, and edges into new code and fixes flow.

A frosted overlay walks each substep: the summary, then **explain** and **check** notes that jump to and flash their diff lines and highlight their diagram node, then a few **questions** for the reviewer. There is no done card: the next card is the next substep's summary. The reviewer marks each check and question **Safe** (they own it: minor, or fixed later) or **Review** (they want to think it over). After the last substep, Next opens the **review list**: every item to review or still open, each linked to its line (or file) in the PR's GitHub diff so the reviewer can comment there. On any card, `n` opens a note box; the list shows every note first, with its card's context and, for checks and questions, its link. Marks and notes stay in the browser. The only write is the review list's **Publish pending review** button, which asks a local helper (`scripts/publish-review.mjs`) to create a PENDING review on GitHub from the Review items and notes, after a confirmation. It never submits: only you can see the pending review until you submit it on GitHub.

Skill root: `~/.agents/skills/operator-review/`. Data schema, diagram rules and note rules: [reference.md](reference.md). Worked examples: [examples/single-pr.mjs](examples/single-pr.mjs) (one PR, with diffs, notes and questions) and [examples/multi-pr-stack.mjs](examples/multi-pr-stack.mjs) (five stacked PRs, diagrams only). Read the single-PR example before writing the first storyboard.

## Workflow

```
- [ ] 1. Resolve the PRs and their order
- [ ] 2. Save and read each diff (and any review findings already in the conversation)
- [ ] 3. Plan the steps, substeps, notes and questions
- [ ] 4. Write the storyboard module
- [ ] 5. Build: validate, fix, emit
- [ ] 6. Open it and check it in a tab you own
```

### 1. Resolve the PRs

Run `gh` outside the sandbox, because it reads the OS keyring.

```bash
gh pr view <n> --repo <owner/repo> --json number,title,url,baseRefName,headRefName,headRefOid,files
```

- **One PR**: the steps are areas of the change. Use 3–5 areas, grouped by feature or intent, not by folder.
- **Several PRs**: one step per PR. When one PR's `baseRefName` is another's `headRefName`, they're stacked; order them base first. Otherwise use the order the user gave.

Never check out PR branches in the user's tree.

### 2. Save and read the diffs

Pick a work folder outside the repo (or a gitignored one) for the module and its diffs, and save each PR's own diff there:

```bash
WORK=~/.cache/operator-review-src/<slug>; mkdir -p "$WORK"
gh pr diff <n> --repo <owner/repo> > "$WORK/<n>.diff"
```

Read enough code to name the real functions, files, env vars and data that changed. Labels must be real identifiers, not invented ones. Note line numbers from the new side of each hunk: notes must point at lines the shown patch contains, and the build checks it. If the conversation already holds review findings, such as a thermo-nuclear or censor review, they become the `risk`/`fix` substeps and their check notes. Prefer stack-aware conclusions: a change that looks unjustified in one PR may be used by the next.

### 3. Plan the storyboard

For each step, tell a short story in 2–4 substeps:

1. **Before**: the existing flow the PR touches. All nodes untagged, usually no files.
2. **After**: the same flow, with added or changed nodes tagged `:::new` and removed ones `:::gone`. Attach the 1–3 files that implement it, plus a few explain notes.
3. **Review** (when there are findings): the problem tagged `:::risk`, the remedy `:::fix`. Attach the offending hunk, a check note per finding (linked to its `:::risk` node), and up to three questions.
4. **Deploy** (only if real): config, migrations or queue ordering, tagged `:::risk`.

Substeps within a step should evolve: reuse node ids and labels between "Before" and "After", so the reader sees the same shape change. Use one diagram for one idea, with at most about 12 nodes. Note and question rules are in [reference.md](reference.md#diffs-notes-and-questions); in short, few explains, checks only where you'd comment, questions only for decisions the diff can't settle.

Put breaking changes in the substep's `breaking` array; they render under a **BREAKING** heading. Set `verdict` on a step only when a review verdict exists.

### 4. Write the module

Write `$WORK/<slug>.mjs` as `export default { title, subtitle, url, steps }`; see [reference.md](reference.md). Set the PR `url` on the board (one PR) or on each step (several PRs): the sidebar's Open PR button and the review list's GitHub line links come from it. Use template literals for diagrams, and `diff: './<n>.diff'` with `lines: [start, end]` for files.

### 5. Build

```bash
SKILL=~/.agents/skills/operator-review
[ -d "$SKILL/node_modules/@pierre/diffs" ] || npm install --prefix "$SKILL"
node "$SKILL/scripts/build.mjs" "$WORK/<slug>.mjs"            # → ~/.cache/operator-review/<slug>/index.html
node "$SKILL/scripts/build.mjs" "$WORK/<slug>.mjs" --out dir  # custom output folder
node "$SKILL/scripts/build.mjs" "$WORK/<slug>.mjs" --check    # validate only
```

The build renders every diagram with Pele and every diff with Pierre's SSR in Node. It fails on parse errors, unknown classes, node ids containing `_`, missing fields, files missing from the saved diff, notes or questions pointing at a file, line or node the substep doesn't show, and checks without a concern. It warns about a missing GitHub PR url, oversized diagrams, long patches and too many notes or questions. Fix every error and warning, then build again. Don't delete content to get past a failure.

The output folder is self-contained (`index.html`, `storyboard.js`, `pele.global.js`) and works from `file://`.

### 6. Open and check

```bash
open ~/.cache/operator-review/<slug>/index.html
```

If browser tooling is available, check it in a **new tab you open yourself**, then close that tab. Never drive a tab the user is watching: your clicks and reloads move their position and look like bugs to them. Use one in-page script to check that every substep renders without an `.error` element and that every `.file` host has `[data-line]` rows in its shadow root, then screenshot one review substep with a check card open. Clear the slug's `operator-review:<slug>` and `operator-review:<slug>:notes` keys from `localStorage` when you're done, so your test marks and notes don't reach the user.

Tell the user the path; the number of steps, substeps, checks and questions; and the controls: ← → and ↑ ↓ (and the dock arrows) move one card, crossing into the next substep (→ past the last card opens the review list), the sidebar shows a circle per card, `s` marks a check or question Safe and `r` marks it Review, `n` writes a note on the current card for the review list (Esc closes it), keys 1–9 jump to a step, `p` replays the animation, `t` cycles the theme (system, light, dark), and `#step.substep` (or `#list`) in the URL deep-links.

## Updating a storyboard

Edit the module and rebuild into the same folder, then the user reloads. When a review finding changes, for example after a deeper look downgrades it, update its substep's tags, check note and `body` so the page doesn't keep showing a stale blocker. Marks are keyed by note or question position and the reviewer's own notes by card position, so after adding, removing or reordering notes or questions tell the user to press **Reset**, and that their notes may now sit on a neighboring card.
