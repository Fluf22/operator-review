# Storyboard reference

## Module shape

```js
export default {
  slug: 'repo-123-short-name',     // optional; output folder name (defaults to the file name)
  title: 'What the reader is looking at',
  subtitle: 'owner/repo #123 → #124 · one line of context',  // optional
  url: 'https://github.com/owner/repo/pull/123',  // optional; the PR for steps without their own url
  steps: [
    {
      kicker: '#123',              // optional; short label in the sidebar (PR number, or area name for one PR)
      url: 'https://github.com/owner/repo/pull/123',  // optional; "open ↗" on the summary card, and the PR its review links point into
      title: 'Plain-language summary of the step',
      verdict: 'Request changes',  // optional; brick if it says change/block/reject, slate if approve/lgtm/ship
      substeps: [
        {
          title: 'Before: the flow this PR touches',
          body: 'Two or three sentences. Plain text; HTML is escaped.',
          breaking: ['optional', 'one line each'],
          diagram: `flowchart LR
  A[Existing] --> B["Changed<br>second line"]:::new`,
          files: [                 // optional; Pierre diffs under the diagram
            { path: 'src/a.ts', diff: './123.diff', lines: [40, 72] },  // section of a saved `gh pr diff`, trimmed to hunks touching new lines 40-72
            { path: 'src/b.ts', patch: '@@ -1,2 +1,3 @@\n a\n+b\n c' },  // or inline hunks
          ],
          notes: [                 // optional; overlay cards after the summary, in this order
            { kind: 'explain', path: 'src/a.ts', line: 44, node: 'B', body: 'What this hunk does in the PR.' },
            { kind: 'check', path: 'src/a.ts', line: 60, end: 63, body: 'What the code does.', concern: 'The suspected bug or sensitive bit.' },
          ],
          questions: [             // optional; overlay cards after the notes
            'A decision the reviewer must make?',
            { ask: 'Another one?', context: 'Why it matters, one sentence.', path: 'src/a.ts', line: 60 },
          ],
        },
      ],
    },
  ],
};
```

`diff` paths resolve relative to the module file. `lines` is optional; without it the whole file section is shown.

Notes fields: `kind` (`explain` | `check`), `body`, `concern` (required on checks), and optionally `path` (must be one of the substep's `files`), `line` and `end` (new-side line numbers visible in the shown patch), `side: 'old'` (anchor to deleted lines by their old numbers), and `node` (a node id in the substep's diagram, highlighted while the card is open).

Questions take the same optional `path`, `line`, `end` and `side`. The build turns each check and question anchor into a GitHub link, `<pr>/files#diff-<sha256(path)>R<line>` (`L` for `side: 'old'`), using the step's `url` or else the board's. Without a `line` the link opens the file; without a `path`, the PR's files tab.

## Diagram rules

- Use `flowchart LR` by default; the page switches to top-down when the stage is narrow. Pele supports every Mermaid 12 diagram type, but the animation is tuned for flowcharts.
- The only classes are `:::new`, `:::gone`, `:::risk` and `:::fix`. Untagged means unchanged. Don't use `classDef`; the theme overrides it.
- Node ids are letters and digits only, with **no `_`**, because edge animation splits Pele's `L_<from>_<to>_<n>` edge ids on `_`.
- Quote labels that contain parentheses, commas, colons or `#`: `A["Northwind (US)"]`. Break long labels with `<br>`; keep each line under about 30 characters.
- Use `-.->` for "moves to", "suggested" or "optional" links, and `-- label -->` for branches.
- Shapes: `[(db)]` for storage, `{decision}`, `(rounded)`, `[[subroutine]]`. Use `subgraph X[Label] … end` for module or service boundaries.
- `A & B --> C` fans in. It renders fine and keeps the source short.
- Keep it under about 12 nodes and 1700px wide. Split into two substeps rather than cramming.

## Diffs, notes and questions

- **Files**: the 1–3 files that tell the substep's story, trimmed with `lines` to the hunks that matter. The diagram is the map; the diff is the evidence. "Before" substeps usually have no files.
- **Explain** notes orient: what this hunk is in the PR, in one or two sentences. Use a few, not one per hunk.
- **Check** notes flag only code you would actually comment on, or want someone to explicitly own. `body` says what the code does; `concern` names the bug or risk. A flag, not a quiz. Pair each with the diagram's `:::risk` node via `node`.
- **Questions**: at most three per substep, usually only on review substeps. Each is a decision the reviewer has to make that the diff can't settle ("Is a stripped match ever safe on a shared stem?"), not a test with a known answer. Use `context` when the stakes aren't obvious. Give a question a `path` and `line` when one line is where the reviewer would comment.
- Anchor every check, and every note you can, to a `line`; the page scrolls to it, flashes it, and keeps a slate bar on it while the card is open. In the review list, that anchor is the reviewer's link to comment on the PR.

## Writing captions

- `title`: what changes or what is wrong, in about 8 words.
- `body`: what the reader should notice in the diagram, and why it matters. Name real functions and files. No restating the title.
- Review substeps: say the problem, then the concrete remedy. Note when a finding is a minor point rather than a blocker.
- `breaking`: every behavior, contract, config or compile-time break, even when intended.

## Page behavior (for answering user questions)

- Design follows [DESIGN.md](DESIGN.md): system UI font, slate neutrals in light and dark, a panel sidebar, a frosted notes overlay (ochre-tinted on checks) and a floating dock. Diagrams are the one exception to the slate palette: `new` nodes and the edges into them are blue, `risk` nodes and their edges are red, `fix` nodes and the edges into them are green with a dashed border, and `gone` is muted dotted. Elsewhere in the chrome, green appears only in diff additions. Don't restyle the template per storyboard.
- Theme: the button beside the sidebar title (or `t`) cycles System → Light → Dark. The choice is saved in `localStorage` for every storyboard, and the diffs follow it.
- Sidebar head: title, subtitle, and an **Open PR #N ↗** button for the current step's `url`, or else the board's `url` (a GitHub URL is trimmed to the PR page and labeled with its number; other http(s) URLs show as "Open PR ↗"; hidden when neither is set). On a stacked board it follows the step you're on; in the review list it shows the board's PR, or the only PR when every step shares one, and hides otherwise. Review-list line links need a GitHub PR URL.
- Sidebar: steps and substeps as an explorer list; each substep shows its count of open checks and questions. A last **Review list** row counts the items to review, and the footer reads "N open · M to review".
- Overlay cards per substep: Summary (title, body, BREAKING) → notes → questions. There is no done card: past a substep's last card, the next card is the next substep's summary, and past the last card overall, the review list. ← → ↑ ↓ and the dock arrows each move one card. The first-card and minimize buttons sit in the card header. The sidebar shows one circle per card beside each substep; the current card's circle is darker in light mode and lighter in dark mode. On a check or question, the file and line is a link to that line on GitHub.
- Checks and questions are open until marked. **Safe** (`s`) means the reviewer owns it: not a big deal, or fixed later. **Review** (`r`) puts it on the review list. Pressing the active mark again reopens it. Marks are saved in `localStorage` per slug, and **Reset** clears them; marks from older pages (owned, waived) load as Safe. Nothing is posted anywhere by marks or notes.
- Reviewer notes: `n` (or the pen button in the card header) opens a note box on the current card, whatever its kind. Text saves as you type, Esc closes the box (so does the pen, or `n` once focus has left the field), and emptying it deletes the note. While the cursor is in the field, `n` is text and page shortcuts don't run. A saved note shows on its card; click it to edit. Notes live in `localStorage` under `operator-review:<slug>:notes`, keyed by card position, and **Reset** leaves them alone. The sidebar footer counts them.
- Review list: opened by Next or → after the last card of the last substep, the sidebar row, the picker, or `#list`. **Your notes** comes first: each note with its card's kind, substep, context (the explain text, concern or question), GitHub link when the card has one (checks and questions), Edit (jumps back with the box open) and, on checks and questions, the Safe/Review buttons. Then items under To review, Still open (only when some are) and Safe. Each item shows its substep, text, its GitHub link for commenting (see the anchor rules above), Safe/Review buttons, and a jump back to its card. **Copy as Markdown** (shown when something is marked Review or noted) copies a To review task list and a Notes list, with their links; each note is a blockquote under its item, so code or headings in it stay contained. **Publish pending review** (shown with Copy as Markdown) turns the To review items and notes into inline comments on one PENDING GitHub review per PR (a PR that fails does not stop the others; the status line lists each result; `g` on the list does the same), through the local helper: start it with `node scripts/publish-review.mjs` (it listens on 127.0.0.1:4317 and only accepts the file:// page). Items without a diff line go in the review's summary body. The button never submits, and it refuses if you already have a pending review on that PR (it links to it). Cards without a PR link are skipped and counted. ← goes back to the last substep.
- A **Keyboard shortcuts** button sits at the bottom of the sidebar, and `?` opens the same list. Escape or a click outside closes it. It lists every key in the page's handler, so update it when you add one.
- There is no autoplay. ← → (and ↑ ↓, and the dock arrows) move one card. The dock's middle button opens a substep picker; clicking a sidebar row or pressing 1–9 jumps. `p` replays the diagram animation. `#step.substep` in the URL opens on that substep.
- Resizing re-renders without re-animating. Each substep animates once when entered.
- The legend shows only the classes used somewhere in the storyboard.
