import type { Inbox, InboxPr, InboxSection, Session, Tag } from "./types";
import { gh, ghJson, isBot, isStale } from "./gh";

type SearchRow = {
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  isDraft?: boolean;
  author?: { login: string };
  repository?: { nameWithOwner: string };
};

function keyOf(repo: string, number: number) {
  return `${repo}#${number}`;
}

function toPr(row: SearchRow, repoFallback?: string): InboxPr | null {
  const repo = row.repository?.nameWithOwner ?? repoFallback;
  const author = row.author?.login;
  if (!repo || !author || row.isDraft) return null;
  return {
    number: row.number,
    title: row.title,
    url: row.url,
    repo,
    author,
    updatedAt: row.updatedAt,
    tags: [],
    bot: isBot(author),
  };
}

async function search(args: string[]): Promise<SearchRow[]> {
  try {
    return await ghJson<SearchRow[]>([
      "search",
      "prs",
      "--limit",
      "50",
      "--json",
      "number,title,url,repository,author,updatedAt,isDraft",
      ...args,
    ]);
  } catch {
    return [];
  }
}

/** First paint uses search only — no per-PR reviews/comments API. */
async function unionSearch(
  me: string,
  extra: string[],
  repo?: string,
): Promise<InboxPr[]> {
  const [requested, reviewed, assigned, authored] = await Promise.all([
    search(["--state", "open", "--review-requested", "@me", ...extra]),
    search(["--state", "open", "--reviewed-by", "@me", ...extra]),
    search(["--state", "open", "--assignee", "@me", ...extra]),
    search(["--state", "open", "--author", "@me", ...extra]),
  ]);
  const requestedKeys = new Set(
    requested
      .map((row) => {
        const r = row.repository?.nameWithOwner ?? repo;
        return r ? keyOf(r, row.number) : "";
      })
      .filter(Boolean),
  );
  const map = new Map<string, InboxPr>();
  for (const row of [...requested, ...reviewed, ...assigned, ...authored]) {
    const pr = toPr(row, repo);
    if (!pr) continue;
    const key = keyOf(pr.repo, pr.number);
    if (map.has(key)) continue;
    const tags: Tag[] = [];
    if (pr.author === me) tags.push("You");
    if (requestedKeys.has(key)) tags.push("Waiting");
    if (isStale(pr.updatedAt)) tags.push("Stale");
    map.set(key, { ...pr, tags });
  }
  return [...map.values()];
}

function splitBots(prs: InboxPr[]): { human: InboxPr[]; bots: InboxPr[] } {
  const human: InboxPr[] = [];
  const bots: InboxPr[] = [];
  for (const pr of prs) (pr.bot ? bots : human).push(pr);
  const rank = (p: InboxPr) => {
    if (p.tags.includes("Waiting")) return 0;
    return 1;
  };
  human.sort((a, b) => rank(a) - rank(b) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  bots.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return { human, bots };
}

export async function loadInbox(session: Session): Promise<Inbox> {
  const me = await gh(["api", "user", "--jq", ".login"]);
  const sections: InboxSection[] = [];

  if (session.scope === "account" || (!session.repo && session.scope !== "org")) {
    const all = await unionSearch(me, []);
    sections.push({ id: "account", label: "Your GitHub", ...splitBots(all) });
    return { me, sections };
  }

  if (session.scope === "org") {
    const org = session.org ?? session.repo?.split("/")[0];
    if (!org) throw new Error("org scope needs org or repo");
    const all = await unionSearch(me, ["--owner", org]);
    sections.push({ id: "org", label: org, ...splitBots(all) });
    return { me, sections };
  }

  const repo = session.repo;
  if (!repo) throw new Error("repo/branch scope needs repo");
  const extra = ["--repo", repo];

  let branchPr: InboxPr | undefined;
  if (session.branch) {
    try {
      const rows = await ghJson<SearchRow[]>([
        "pr",
        "list",
        "--repo",
        repo,
        "--head",
        session.branch,
        "--state",
        "open",
        "--json",
        "number,title,url,author,updatedAt,isDraft",
      ]);
      const row = rows[0];
      if (row) {
        const pr = toPr({ ...row, repository: { nameWithOwner: repo } }, repo);
        if (pr) {
          const tags: Tag[] = [];
          if (pr.author === me) tags.push("You");
          if (isStale(pr.updatedAt)) tags.push("Stale");
          branchPr = { ...pr, tags };
        }
      }
    } catch {
      branchPr = undefined;
    }
  }

  const rest = await unionSearch(me, extra, repo);
  const withoutBranch = rest.filter(
    (p) => !(branchPr && p.number === branchPr.number && p.repo === branchPr.repo),
  );

  if (branchPr) {
    sections.push({
      id: "branch",
      label: `Current branch (${session.branch})`,
      ...splitBots([branchPr]),
    });
  }
  sections.push({ id: "repo", label: repo, ...splitBots(withoutBranch) });
  return { me, sections };
}
