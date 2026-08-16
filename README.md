# Operator Review

A Cursor skill plus a local visualizer for reviewing GitHub PRs.

The skill sets up the walk. The app shows the inbox, Pierre diffs, overlay cards, drafts, and Send. You review in the pane. Chat is there when you want context or help drafting a comment.

## What you get

| Piece | Job |
| --- | --- |
| **Skill** (`SKILL.md`) | Preflight `gh`, start the app, seed a session, group the diff by **feature**, plant explain/check cards |
| **App** (`app/`) | Local Vite + React pane on `127.0.0.1:4310`. Inbox, walk overlay, draft comments, submit via `gh api` |

Submit happens when you hit **Send** in the app.

## Install

Requires [GitHub CLI](https://cli.github.com/) (`gh auth login`) and a Cursor agent that can run `gh` and `curl` to localhost.

```bash
npx skills add Fluf22/operator-review -g -a cursor -y
```

That installs to `~/.agents/skills/operator-review/`. Override the app path with `OPERATOR_REVIEW_APP` if you run a checkout instead of the installed copy.

Invoke in Cursor when you are assigned to review, or say `/operator-review`, `review-work`, `review inbox`, or `review walk`.

## How a session works

```
preflight (gh + cwd repo/branch)
  → ensure app on :4310
  → POST /api/session
  → open http://127.0.0.1:4310/?session=<id>
  → comments-first if threads exist, else feature-grouped diffs
  → review in the overlay; chat when you want help
  → Send when checks are owned or waived
  → “next is #N — continue?”
```

**Inbox** (closest first): current-branch PR, rest of the repo, then org or account. Involved means author ∪ assignee ∪ review-requested ∪ reviewed-by. Drafts are excluded. Bots sort to the bottom of each list. Clicking a row copies `#N`. Paste that number in chat to start the walk.

**Walk.** Files are clustered by feature and intent. Each group has a `why`. Overlay cards are either:

- **explain** — what this hunk does in the PR
- **check** — a sensitive or buggy-looking bit to look at

Clicks move the lens. Mark a check `judged` or `waived` when you own it. Send waits until open checks are cleared; **Waive remaining** skips the rest.

The URL mirrors the walk (`?session=&pr=&group=&note=&path=&line=`). After the tab is open, the skill drives the pane with `PATCH` over SSE.

## Repo layout

```
SKILL.md          Agent instructions (setup, grouping, walk)
PRODUCT.md        Who it is for and what success looks like
DESIGN.md         Visual language (Cursor-density chrome, Pierre diffs)
app/              Companion visualizer
  API.md          Session HTTP + SSE contract
  server/         Vite middleware: sessions, inbox, PR payload, submit
  src/            React UI (inbox, walk overlay, drafts, submit bar)
```

Sessions persist under `app/.sessions/` (gitignored).

## Run the app locally

From a clone, with `gh` already authenticated as the reviewer:

```bash
cd app
npm install
npm run dev
```

Binds **127.0.0.1:4310** (`strictPort`). Health: `GET /api/health` → `{ "ok": true }`.

The page needs a session:

```bash
curl -sS -X POST http://127.0.0.1:4310/api/session \
  -H 'Content-Type: application/json' \
  -d '{"scope":"repo","repo":"owner/name","branch":"feat/foo","mode":"inbox"}'
```

Open `http://127.0.0.1:4310/?session=<id>`. Full route list: [app/API.md](app/API.md).

## Design stance

Quiet, precise, secondary. The pane recedes so Cursor and the diffs can lead.

- Overlay is the map (explain) and the flags (check). Chat is on demand.
- One job per width: list, or groups, or the current diff.
- Green and red belong to the diff. Chrome is cool slate, system UI.
- Click a row to copy `#N`.

See [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md).
