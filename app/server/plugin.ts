import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { randomUUID } from "node:crypto";
import { createSession, patchSession, readSession, subscribe, writeSession } from "./store";
import { loadInbox } from "./inbox";
import { ghJson } from "./gh";
import { unjudgedNotes } from "../src/ledger";
import type { Draft, Session, SessionCreate } from "./types";

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const { pathname } = url;
  const method = req.method ?? "GET";

  if (method === "GET" && pathname === "/api/health") {
    send(res, 200, { ok: true });
    return true;
  }

  if (method === "POST" && pathname === "/api/session") {
    const input = JSON.parse(await readBody(req) || "{}") as SessionCreate;
    if (!input.scope) {
      send(res, 400, { error: "scope is required" });
      return true;
    }
    const session = await createSession(input);
    send(res, 201, session);
    return true;
  }

  const sessionMatch = pathname.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
  if (sessionMatch) {
    const id = sessionMatch[1]!;
    const rest = sessionMatch[2] ?? "";

    if (method === "GET" && rest === "events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const sendEvent = (payload: unknown, event: string) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      };
      const unsub = subscribe(id, sendEvent);
      const ping = setInterval(() => sendEvent({ t: Date.now() }, "ping"), 15000);
      try {
        sendEvent(await readSession(id), "session");
      } catch {
        sendEvent({ error: "missing session" }, "session");
      }
      req.on("close", () => {
        clearInterval(ping);
        unsub();
      });
      return true;
    }

    if (method === "GET" && rest === "") {
      send(res, 200, await readSession(id));
      return true;
    }

    if (method === "PATCH" && rest === "") {
      const patch = JSON.parse(await readBody(req) || "{}") as Record<string, unknown>;
      send(res, 200, await patchSession(id, patch));
      return true;
    }

    if (method === "POST" && rest === "drafts") {
      const body = JSON.parse(await readBody(req) || "{}") as Omit<Draft, "id">;
      const session = await readSession(id);
      const draft: Draft = { ...body, id: randomUUID() };
      session.drafts.push(draft);
      send(res, 201, await writeSession(session));
      return true;
    }

    const draftMatch = rest.match(/^drafts\/([^/]+)$/);
    if (method === "DELETE" && draftMatch) {
      const session = await readSession(id);
      session.drafts = session.drafts.filter((d) => d.id !== draftMatch[1]);
      send(res, 200, await writeSession(session));
      return true;
    }

    if (method === "POST" && rest === "submit") {
      const body = JSON.parse(await readBody(req) || "{}") as {
        event?: Session["event"];
        summary?: string;
      };
      const session = await readSession(id);
      if (!session.currentPr || !session.repo) {
        send(res, 400, { error: "currentPr and repo are required to submit" });
        return true;
      }
      if (session.submittedAt && session.drafts.length === 0) {
        send(res, 409, { error: "already submitted; add new drafts to send again" });
        return true;
      }
      const pending = unjudgedNotes(session.notes, session.verdicts);
      if (pending.length) {
        send(res, 409, {
          error: `${pending.length} open checks remain; own them in chat or waive remaining`,
        });
        return true;
      }
      const [owner, name] = session.repo.split("/");
      const pr = await ghJson<{ head: { sha: string } }>([
        "api",
        `repos/${owner}/${name}/pulls/${session.currentPr}`,
      ]);
      const general = session.drafts.filter((d) => !d.path).map((d) => d.body).join("\n\n");
      const summary = [body.summary ?? session.summary ?? "", general].filter(Boolean).join("\n\n");
      const payload = {
        commit_id: pr.head.sha,
        event: body.event ?? session.event ?? "COMMENT",
        body: summary,
        comments: session.drafts
          .filter((d) => d.path && d.line)
          .map((d) => ({
            path: d.path,
            line: d.line,
            side: d.side === "LEFT" ? "LEFT" : "RIGHT",
            body: d.body,
          })),
      };
      const submitted = await submitReview(
        `${owner}/${name}`,
        session.currentPr,
        payload,
      );
      session.submittedAt = new Date().toISOString();
      session.event = payload.event as Session["event"];
      session.summary = payload.body;
      session.drafts = [];
      await writeSession(session);
      send(res, 200, { session, review: submitted });
      return true;
    }
  }

  if (method === "GET" && pathname === "/api/inbox") {
    const id = url.searchParams.get("session");
    if (!id) {
      send(res, 400, { error: "session query required" });
      return true;
    }
    const session = await readSession(id);
    const inbox = await loadInbox(session);
    session.inbox = inbox;
    await writeSession(session);
    send(res, 200, inbox);
    return true;
  }

  const prMatch = pathname.match(/^\/api\/pr\/(\d+)$/);
  if (method === "GET" && prMatch) {
    const id = url.searchParams.get("session");
    const repoParam = url.searchParams.get("repo");
    if (!id) {
      send(res, 400, { error: "session query required" });
      return true;
    }
    const session = await readSession(id);
    const repo = repoParam ?? session.repo;
    if (!repo) {
      send(res, 400, { error: "repo missing" });
      return true;
    }
    const [owner, name] = repo.split("/");
    const number = prMatch[1]!;
    const [pr, files, reviewComments, issueComments, reviews] = await Promise.all([
      ghJson([`api`, `repos/${owner}/${name}/pulls/${number}`]),
      ghJson([`api`, `repos/${owner}/${name}/pulls/${number}/files`, "--paginate"]),
      ghJson([`api`, `repos/${owner}/${name}/pulls/${number}/comments`]),
      ghJson([`api`, `repos/${owner}/${name}/issues/${number}/comments`]),
      ghJson([`api`, `repos/${owner}/${name}/pulls/${number}/reviews`]),
    ]);
    const comments = [...(reviewComments as unknown[]), ...(issueComments as unknown[])];
    send(res, 200, { pr, files, comments, reviews, repo });
    return true;
  }

  return false;
}

async function submitReview(
  repo: string,
  number: number,
  payload: {
    commit_id: string;
    event: string;
    body: string;
    comments: { path?: string; line?: number; side: string; body: string }[];
  },
) {
  const { spawn } = await import("node:child_process");
  const [owner, name] = repo.split("/");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "gh",
      ["api", `repos/${owner}/${name}/pulls/${number}/reviews`, "--method", "POST", "--input", "-"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(err || `gh exited ${code}`));
      else resolve(out ? JSON.parse(out) : {});
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export function operatorReviewApi(): Plugin {
  return {
    name: "operator-review-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const host = req.headers.host ?? "127.0.0.1";
        const url = new URL(req.url ?? "/", `http://${host}`);
        if (!url.pathname.startsWith("/api")) {
          next();
          return;
        }
        try {
          const handled = await handle(req, res, url);
          if (!handled) send(res, 404, { error: "not found" });
        } catch (error) {
          send(res, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}
