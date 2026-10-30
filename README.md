# operator-review

An agent skill that turns a GitHub pull request, or a stack of them, into an animated walkthrough you review in your browser.

Each step of the walkthrough is an area of the change (or one PR in a stack). Each substep is a diagram that evolves: the flow before the change, the change itself, a review finding, and a suggested fix. The code under each diagram is shown as a diff, with notes that point at the exact lines.

Claude Haiku is good enough for most reviews.

## How it works

1. **Resolve.** The agent reads the PRs with `gh` and saves each diff to a work folder outside your checkout. It never checks out PR branches.
2. **Plan.** It splits the change into steps and substeps and writes a storyboard module (`.mjs`): diagrams, the diff files that prove them, explain and check notes, and a few questions for you.
3. **Build.** `scripts/build.mjs` validates the module (node ids, file paths, line anchors), renders the diagrams with [Pele](https://pele.run) and the diffs with [Pierre](https://www.npmjs.com/package/@pierre/diffs), and writes a self-contained `index.html` to `~/.cache/operator-review/<slug>/`.
4. **Review.** Open the page in your browser. It works from `file://`, with no server.

In the page:

- **Arrows** (`←` `→`, `↑` `↓`) move one card at a time. The card sequence is each substep's summary, then its notes, then its questions.
- **Safe** (`s`) means you own the point. **Review** (`r`) puts it on the review list.
- **Notes** (`n`) let you write your own comment on any card.
- **Review list.** After the last card, the review list shows everything you marked Review and every note you wrote. Each item links to its line in the PR's GitHub diff.
- **Publish pending review** creates a pending GitHub review from those items. It never submits; you do that on GitHub.
- `1`–`9` jump to a step, `p` replays the animation, `t` cycles the theme, and `?` lists every shortcut.

Marks and notes stay in your browser. The only write to GitHub is the pending review you choose to publish.

## Install

You need:

- An agent that supports skills, such as Cursor or Claude Code.
- Node.js, with `npm` on your path.
- The GitHub CLI, `gh`, signed in to an account that can read the repos you review.

Install the skill with the `skills` CLI:

```bash
npx skills add Fluf22/operator-review
```

To install it once for every project instead of one project, add `-g`:

```bash
npx skills add Fluf22/operator-review -g
```

The first build installs the two npm dependencies (`@pierre/diffs` and `pele`) into the skill folder. Nothing else needs setup.

**Optional, macOS only:** to make the **Publish pending review** button work without a terminal, install its background helper once:

```bash
node <skill folder>/scripts/install-helper.mjs
```

Run it again if you move the skill folder. `node scripts/install-helper.mjs uninstall` removes it.

## Use

In your agent, ask for a review by PR:

```
/operator-review owner/repo#123
```

A stack works too: give the PRs in order, and each becomes one step. Then open the page the agent reports, for example:

```bash
open ~/.cache/operator-review/<slug>/index.html
```

To rebuild after changing the module, run the build again into the same folder and reload the page:

```bash
node <skill folder>/scripts/build.mjs <module>.mjs
node <skill folder>/scripts/build.mjs <module>.mjs --check   # validate only
```

## Files

- `SKILL.md`: the workflow the agent follows.
- `reference.md`: the storyboard format, diagram rules and note rules.
- `DESIGN.md`: the page's visual design.
- `examples/`: a single-PR walkthrough and a five-PR stack, plus a sample diff.
- `scripts/build.mjs`: validates and builds a storyboard.
- `scripts/publish-review.mjs`: the local helper behind the publish button.
- `scripts/install-helper.mjs`: installs that helper as a macOS background service.
- `template/`: the page and its stylesheet.
