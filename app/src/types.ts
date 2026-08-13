export type Scope = "branch" | "repo" | "org" | "account";
export type Mode = "inbox" | "walk" | "comments-first";
export type ReviewEvent = "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
export type Tag = "You" | "Waiting" | "New commits" | "New comments" | "Stale";

export type Grill = {
  question: string;
  recommended?: string;
  options?: string[];
};

export type Focus = {
  path?: string;
  line?: number;
  commentId?: string;
  group?: string;
};

export type NoteVerdict = "judged" | "waived";

export type WalkNoteKind = "explain" | "check";

export type WalkNote = {
  id: string;
  group?: string;
  path?: string;
  line?: number;
  /** explain = orientation; check = look and decide (comment, fix, or own). */
  kind?: WalkNoteKind;
  /** What this hunk does in the PR. */
  body: string;
  /** Check cards only: the sensitive bit or suspected bug. */
  concern?: string;
  /** Glance-and-move-on; does not enter the ledger. */
  glance?: boolean;
};

export type DiffGroup = {
  id: string;
  label: string;
  /** Group summary shown in the notes overlay. */
  why?: string;
  paths: string[];
};

export type Draft = {
  id: string;
  path?: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
  body: string;
};

export type InboxPr = {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  updatedAt: string;
  tags: Tag[];
  bot: boolean;
};

export type InboxSection = {
  id: "branch" | "repo" | "org" | "account";
  label: string;
  human: InboxPr[];
  bots: InboxPr[];
};

export type Inbox = {
  me: string;
  sections: InboxSection[];
};

export type Session = {
  id: string;
  scope: Scope;
  repo?: string;
  branch?: string;
  org?: string;
  prs?: number[];
  currentPr?: number;
  mode: Mode;
  seed?: Record<string, unknown>;
  grill?: Grill;
  focus?: Focus;
  groups?: DiffGroup[];
  activeGroup?: string | null;
  /** Overlay cursor: "summary" | note id | "done". */
  activeNote?: string | null;
  /** PR-level overlay summary (Whole PR, or fallback). */
  brief?: string;
  notes?: WalkNote[];
  /** Check-card id → owned (looked and decided) or waived. */
  verdicts?: Record<string, NoteVerdict>;
  drafts: Draft[];
  event?: ReviewEvent;
  summary?: string;
  inbox?: Inbox;
  submittedAt?: string;
  readyToSubmit?: boolean;
  updatedAt: string;
};

export type PrFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export type PrPayload = {
  repo: string;
  pr: {
    title: string;
    html_url: string;
    user: { login: string };
    additions: number;
    deletions: number;
    changed_files: number;
    head: { sha: string; ref: string };
    base: { ref: string };
    body: string | null;
  };
  files: PrFile[];
  comments: {
    id: number;
    path: string;
    line: number | null;
    body: string;
    user: { login: string };
  }[];
  reviews: { id: number; user: { login: string }; state: string; body: string }[];
};
