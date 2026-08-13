# Session API

Base: `http://127.0.0.1:4310`

The app visualizes (inbox, diffs, drafts, submit) and holds the walk **cursor** plus a ledger of **check** cards. The operator reviews in the pane. Chat answers when they ask (context, or help drafting a comment). The skill GETs the session when they ask, then PATCHes so the pane follows if needed.

Groups are **features**, not files or folders: `{ id, label, why, paths }`. `why` is the overlay summary for that group. `brief` is the PR-level summary (Whole PR). `notes` are `{ id, group, path, line, kind, body, concern?, glance? }` with `kind` `"explain"` | `"check"`.

Cursor and ledger:

- `activeNote`: `"summary"` | note id | `"done"` — overlay card; human up/down and the skill both PATCH this
- `verdicts`: `{ [noteId]: "judged" | "waived" }` — merged on PATCH. Only **check** cards enter the ledger
- `focus`: `{ path, line, commentId, group }` — diff jump

Explain cards are orientation. Check cards flag a concern. Overlay clicks are not decisions. Send is rejected while check cards are open (`409`). The submit bar can **Waive remaining**.

The page URL mirrors the walk (`?session=&pr=&group=&note=&path=&line=`). Opening that URL is equivalent intent; PATCH is the live control path. Do not send `grill`.

## Health

`GET /api/health` → `{ "ok": true }`

## Session

`POST /api/session` body:

```ts
{
  scope: "branch" | "repo" | "org" | "account"
  repo?: string          // owner/name
  branch?: string
  org?: string
  prs?: number[]         // selected queue
  currentPr?: number
  mode?: "inbox" | "walk" | "comments-first"
  seed?: Record<string, unknown>
}
```

Response: full `Session` including `id`.

- `readyToSubmit?: boolean` — when true, the walk footer shows Send / Approve / Request changes

`PATCH /api/session/:id` → merge JSON into session, persist, broadcast SSE `session`. Returns `Session`. `verdicts` are merged by key, not replaced.

`GET /api/session/:id` → `Session` (read `activeNote`, `verdicts` at the start of each chat turn).

`GET /api/session/:id/events` → `text/event-stream`. Events:

- `session` — full session JSON
- `inbox` — inbox payload (after refresh)
- `ping` — keepalive

## Inbox

`GET /api/inbox?session=:id` — fetch + classify using session scope. Caches on the session as `inbox`.

Uses `gh` as the logged-in user. Involved = author ∪ assignee ∪ review-requested ∪ reviewed-by. `draft:false`.

## PR payload

`GET /api/pr/:number?session=:id` → `{ pr, files, patch, comments, reviews }` for the session repo (or `?repo=owner/name`).

## Drafts

`POST /api/session/:id/drafts` `{ path?, line?, side?, body }`
`DELETE /api/session/:id/drafts/:draftId`

## Submit

`POST /api/session/:id/submit` `{ event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES", summary?: string }`

Creates **one** GitHub review from `drafts` + summary via `gh api` (`POST /repos/{o}/{r}/pulls/{n}/reviews`). Rejects with 409 if check cards are still open, or if already submitted with empty drafts. On success, clears `drafts` and sets `submittedAt`.

## Session file

Persisted at `app/.sessions/<id>.json` (gitignored).
