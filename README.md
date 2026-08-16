# Operator Review

This skill is a walkthrough companion for doing code review: you give it a PR number, or you choose from the list it displays to you, then it walks you through the review, explaining what the code does, and what the author could have missed

You follow along and understand what the code does, you can still chat with your favorite AI to verify or explore things; you can also leave comments and publish them at the end of your review

It’s for a second pair of eyes: it assumes the original author already leveraged AI to its full extent, and now it helps a second human mind try to find other ways to accomplish the same objectives if there are better, like you would usually for human authored code

## Install

Requires [GitHub CLI](https://cli.github.com/) (`gh auth login`).

It was initially made for Cursor:
```bash
npx skills add Fluf22/operator-review -g -a cursor -y
```

But you can also install it as a standalone helper app for any other harness:
```bash
npx skills add Fluf22/operator-review -g -y
```

That installs to `~/.agents/skills/operator-review/`. 

Invoke when you are assigned to review, or say `/operator-review`, `review-work`, `review inbox`, or `review walk`.

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

**Walk.** Files are clustered by feature and intent. Each group has a `why`. 

Overlay cards are either:

- **explain** — what this hunk does in the PR
- **check** — a sensitive or buggy-looking bit to look at

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
