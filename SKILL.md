---
name: operator-review
disable-model-invocation: true
description: >-
  Run a human operator's GitHub PR review session. Opens a local Pierre inbox
  (current branch → repo → org/account), walks comments then feature-grouped diffs,
  and keeps draft review comments for one-click submit. Use when the
  user is assigned to review, says /operator-review, review-work, review inbox,
  review walk, or wants to walk PRs they author, are assigned to, were asked to
  review, or already reviewed.
---

# Operator Review

Copilot for **you** reviewing GitHub PRs. The app visualizes (inbox, Pierre diffs, overlay, drafts, Send). This skill **sets up the walk** (feature groups, explain/check cards) and then stays quiet. The operator reviews in the pane. They use this chat when they want more context or help drafting a comment. Do not run grill-me. Do not PATCH `grill`. Do not render questions or options in the app.

Explain cards are orientation. Check cards flag sensitive or buggy-looking bits. Overlay clicks move the lens; they do not record a decision. Send is blocked while check cards remain open (`verdicts[id]=judged` when they own it or you captured a draft, or `waived`).

You never silent-post a GitHub review. The operator hits Send in the app.

Do not use `pr-review-canvas` in this flow.

## Layout

Skill root: `~/.agents/skills/operator-review/`

- `SKILL.md` — this file
- `app/` — Vite + React companion (`@pierre/trees`, `@pierre/diffs`)
- Session API: [app/API.md](app/API.md)

Port **4310**, bind **127.0.0.1**. Override app path with `OPERATOR_REVIEW_APP`.

## Host permissions (required)

`gh` reads the OS keyring. `curl` talks to `127.0.0.1`. Both **fail inside the Cursor sandbox** (invalid token / health `000`).

For every `gh`, `curl`, `npm install`, and `npm run dev` in this skill, run the Shell tool **outside the sandbox**: `required_permissions: ["all"]`. If a sandboxed attempt fails, retry the same command with `all` immediately. Do not ask the operator to re-auth until `gh auth status` has been run with `all`.

## Workflow

```
- [ ] 1. Preflight (gh auth, infer cwd repo/branch)
- [ ] 2. Ensure app is running
- [ ] 3. POST /api/session (seed)
- [ ] 4. Open http://127.0.0.1:4310/?session=<id> in the Cursor browser
- [ ] 5. After the walk is seeded, stay quiet; answer in chat only when they ask
- [ ] 6. Comments-first if threads exist, else logical-group diff walk
- [ ] 7. Operator reviews drafts in-app and Sends (or skips)
- [ ] 8. Ask “next is #N — continue?” (recommend yes) or stop
```

### 1. Preflight

```bash
gh auth status
```

If unauthenticated, stop: they must `gh auth login`.

Infer context from the **operator's** cwd (the repo they were in when they invoked you), not from this skill directory:

```bash
git -C "$OPERATOR_CWD" rev-parse --is-inside-work-tree
gh -C "$OPERATOR_CWD" repo view --json nameWithOwner,owner -q '{repo:.nameWithOwner,owner:.owner.login}'
git -C "$OPERATOR_CWD" branch --show-current
```

- Inside a git repo with a GitHub remote → default `scope: "repo"` and include `branch` so the app can put the current-branch PR first.
- Home / no git / no GitHub remote → `scope: "account"`. Do not guess a repo.

### 2. Ensure the app is running

```bash
APP="${OPERATOR_REVIEW_APP:-$HOME/.agents/skills/operator-review/app}"
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:4310/api/health
```

- `200` → reuse.
- Else, from `$APP`: `npm install` if `node_modules` is missing, then `npm run dev` backgrounded (port 4310, host 127.0.0.1). Wait until `/api/health` is 200. If 4310 is taken by something else, stop and say so.

### 3. Seed the session

`POST http://127.0.0.1:4310/api/session` with JSON (see [app/API.md](app/API.md)). Minimal:

```json
{
  "scope": "repo",
  "repo": "owner/name",
  "branch": "feat/foo",
  "mode": "inbox"
}
```

- `prs: [123, 456]` if they already named PRs.
- `mode: "comments-first"` only when you already know the target PR has review threads.
- `seed` can hold free-form notes from this chat.

Save the returned `id`.

### 4. Open the browser

Open `http://127.0.0.1:4310/?session=<id>` in the Cursor Simple Browser (in-app browser / `open_resource` with that http URI). Do not dump the inbox in chat — the app owns it.

The conversation controls the page by **PATCH** (SSE, no reload). The app mirrors the walk onto the URL:

`http://127.0.0.1:4310/?session=<id>&pr=6731&group=async-batch&note=n1`

Optional: `&path=file&line=12`. Opening that URL also works (full navigation). Prefer PATCH after the tab is open; do not reopen the browser unless it is on a different session.

### 5. The pane leads; chat is on demand

Do **not** read or follow `grill-me`. Do not quiz. Do not narrate every card. Do not nudge each check unprompted.

After you PATCH groups + notes, tell them the walk is ready in **one short sentence**, then stop. They review in the overlay (explain vs check). They come back to this chat when they want:

- more context on what is on screen
- whether something is actually a bug
- help drafting a review comment

When they do ask:

1. `GET /api/session/:id` and talk about `activeNote` (the lens), unless they named a different hunk.
2. If you jump the pane, PATCH `activeGroup` + `activeNote` + `focus` **before** explaining.
3. If they want a comment, draft it via `POST /api/session/:id/drafts` (and `PATCH` `verdicts: { "<check-id>": "judged" }` when it is a check). If they say they own a check with no comment, mark it judged too.

Inbox clicks **copy `#N`** — they do not open the walk. Open the visualizer walk only after they paste a number in **this chat**, then PATCH `currentPr` / `mode`.

Never PATCH `grill`. Never long-poll the app.

Other PATCH fields: `currentPr`, `mode`, `prs`, `groups`, `brief`, `notes`, `readyToSubmit`.

### 6. Walk a PR

When they pick a PR (in chat: a number they pasted, a list, or “everything in sequence”):

1. `PATCH` `{ "currentPr", "prs", "mode", "readyToSubmit": false }`.
2. Fetch threads: `gh api repos/{owner}/{repo}/pulls/{n}/comments` and issue comments.
3. **Comments-first** if any review comments exist (or tags New comments / New commits). Threads are in the pane. PATCH `focus.commentId` when they pick one or ask about it. Capture intended replies as drafts via `POST /api/session/:id/drafts` when they want help writing.
4. **Diff walk** otherwise, and after threads. Cluster files by **feature / intent**, not by path prefix or file type. PATCH `groups` + `activeGroup`. They can say “show the whole PR” → `activeGroup: null`.
5. Mechanical leftovers (lockfile, generated-only, `.gitignore`) last, and only as their own group if they are not part of a feature.

#### How to group

A group is one feature the operator can understand as a unit: “the async helpers,” “the concurrency knob.” Files that implement the same change belong together even if they live in different folders (template + runtime + tests for that helper).

Do **not**:

- Make a group per file
- Make a group per directory (`templates/`, `src/`, `tests/`) unless that directory *is* the feature
- Split a feature from its tests unless the tests are a separate review question (new fixture infra, unrelated coverage)
- Invent extra steps for a 1–2 file PR that is already one feature. Still PATCH **one** group with a `why` so the helper can explain; do not split it.

Do:

- Name the group after the feature (2–5 words): `Async batch helpers`, not `templates` or `ApiClient.java`
- Always set `why`: one or two sentences for the overlay summary of this slice. Not a file list. Not a restatement of the PR title.
- PATCH every group with `id`, `label`, `why`, `paths`
- `paths` are exact `filename` values from `GET /api/pr/:n` (or `gh pr view N --json files`). Never globs, prefixes, or `...`

```json
{
  "brief": "Adds async chunked-batch helpers to the Java client. Sync wrappers await the same core; concurrency is opt-in.",
  "groups": [
    {
      "id": "async-batch",
      "label": "Async batch helpers",
      "why": "chunkedBatchAsync and friends; sync wrappers await the same core so sequential v4 behavior stays the default.",
      "paths": [
        "templates/java/async_batch_helpers.mustache",
        "templates/java/api_helpers.mustache",
        "tests/output/java/src/test/java/com/algolia/manual/AsyncBatchHelpersTest.java"
      ]
    }
  ],
  "activeGroup": "async-batch",
  "activeNote": "n-async-core",
  "notes": [
    {
      "id": "n-async-core",
      "kind": "explain",
      "group": "async-batch",
      "path": "templates/java/async_batch_helpers.mustache",
      "line": 30,
      "body": "New async helpers share one thenCompose chain. Sync wrappers await that core."
    },
    {
      "id": "n-conc-cap",
      "kind": "check",
      "group": "concurrency",
      "path": "clients/algoliasearch-client-java/algoliasearch/src/main/java/com/algolia/utils/ChunkedHelperOptions.java",
      "line": 61,
      "body": "setMaxConcurrency only rejects values below 1.",
      "concern": "No upper cap. The default pool is unbounded — a caller can explode in-flight /batch calls."
    },
    {
      "id": "n-gitignore",
      "kind": "explain",
      "group": "gitignore",
      "path": ".gitignore",
      "line": 60,
      "body": "Unrelated mechanical leftover.",
      "glance": true
    }
  ]
}
```

#### Walk notes (overlay)

Two card kinds. PATCH `brief` and `notes`. Drive with `activeNote`: `"summary"` | note `id` | `"done"`.

Each note:

- `id`, `group`, `path` + `line` (exact filename, a real line in that file’s patch)
- `kind`: `"explain"` (orientation) or `"check"` (look and decide)
- `body`: 1–2 sentences on what this hunk does in the PR
- `concern` (check only): the sensitive bit or suspected bug — a flag, not a quiz
- `glance: true` for trivia. Glance notes are not in the ledger.

Prefer a few explain cards so they understand the feature, and **only** check cards where you would actually want a review comment or an explicit “I own this.” Do not turn every hunk into a check.

Do not PATCH `grill`. Overlay clicks move `activeNote` / `focus` only. PATCH `verdicts: { "<id>": "judged" }` when they own a check or you captured a draft for it.

### 7. Submit lives in the app (end of walk only)

When comments-first + every **check** is owned or waived, `PATCH { "readyToSubmit": true }`. Only then does the app show Comment / Approve / Request changes and Send.

Send stays **blocked** while check cards are open (UI and POST `/submit`). They can **Waive remaining** in the submit bar — that is an explicit skip. Mention open checks before you set `readyToSubmit`.

Do not `gh pr review` yourself unless they explicitly ask you to submit from chat.

If they want a draft summary, PATCH `summary` and `event` so the end screen is prefilled.

### 8. Queue

After they submit, skip, or say they’re done with this PR, ask: **next is #N — continue?** Recommend yes. If yes, PATCH `currentPr` to the next in `prs` (or the next inbox row they named) and repeat from step 6. If the queue is empty, return them to the inbox (`mode: "inbox"`, `currentPr: null`).

## Inbox rules (app enforces; you must not contradict)

Proximity sections, closest first:

1. Current branch (open PR for HEAD, if any)
2. Rest of current repo (de-dupe the branch PR)
3. Show more → org **or** account (operator picks in the app)

Involved in: **author ∪ assignee ∪ review-requested ∪ reviewed-by**. Not comment-only / mentioned-only.

Tags on the inbox list (from `gh search` only — no per-PR API): **You**, **Waiting** (still in review-requested), **Stale** (`updatedAt` ≥ 7 days). **New commits** / **New comments** are decided when walking a PR, not on first inbox load.

Bots (login ends with `[bot]`, or `renovate`, `dependabot`, `github-actions`) sort to the **bottom** of each list behind a **Bots** separator. Not a tag.

Draft PRs: exclude.

## What not to do

- Do not PATCH `grill`, show grill-me UI, or quiz the operator. The pane leads; chat answers when they ask.
- Do not narrate or nudge every card. After seeding the walk, one short “ready” line, then stop.
- Do not discuss a hunk they asked about without PATCHing `activeGroup` + `activeNote` + `focus` first (unless it is already the lens).
- Do not treat overlay/dock clicks as owning a check. They move the lens.
- Do not set `readyToSubmit` while check cards are open unless they are about to waive.
- Do not turn every hunk into a check. Checks are for sensitive or buggy-looking code only.
- Do not group the walk by file or folder. Group by feature and always include `why`.
- Do not check out the PR branch (hostile to the operator’s tree).
- Do not re-render the inbox as a markdown table in chat.
- Do not wait on app clicks. They review in the pane; they type here when they want help.
- Do not post the GitHub review unless they ask you to from chat.
- Do not use Cursor canvas or `pr-review-canvas` HTML for this skill.
