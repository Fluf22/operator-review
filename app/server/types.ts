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
  kind?: WalkNoteKind;
  body: string;
  concern?: string;
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

export type SessionCreate = {
  scope: Scope;
  repo?: string;
  branch?: string;
  org?: string;
  prs?: number[];
  currentPr?: number;
  mode?: Mode;
  seed?: Record<string, unknown>;
};

export type Session = SessionCreate & {
  id: string;
  mode: Mode;
  grill?: Grill;
  focus?: Focus;
  groups?: DiffGroup[];
  activeGroup?: string | null;
  activeNote?: string | null;
  brief?: string;
  notes?: WalkNote[];
  verdicts?: Record<string, NoteVerdict>;
  drafts: Draft[];
  event?: ReviewEvent;
  summary?: string;
  inbox?: Inbox;
  submittedAt?: string;
  readyToSubmit?: boolean;
  updatedAt: string;
};
