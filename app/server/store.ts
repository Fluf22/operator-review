import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { Session, SessionCreate } from "./types";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".sessions");

const listeners = new Map<string, Set<(payload: unknown, event: string) => void>>();

export async function ensureStore() {
  await mkdir(dir, { recursive: true });
}

function fileFor(id: string) {
  if (!/^[\w-]+$/.test(id)) throw new Error("invalid session id");
  return path.join(dir, `${id}.json`);
}

export async function createSession(input: SessionCreate): Promise<Session> {
  await ensureStore();
  const session: Session = {
    ...input,
    id: randomUUID(),
    mode: input.mode ?? "inbox",
    drafts: [],
    updatedAt: new Date().toISOString(),
  };
  await writeFile(fileFor(session.id), JSON.stringify(session, null, 2));
  return session;
}

export async function readSession(id: string): Promise<Session> {
  const raw = await readFile(fileFor(id), "utf8");
  return JSON.parse(raw) as Session;
}

export async function patchSession(id: string, patch: Record<string, unknown>): Promise<Session> {
  const current = await readSession(id);
  const { id: _ignore, drafts: _d, verdicts, ...rest } = patch;
  const next: Session = {
    ...current,
    ...rest,
    id: current.id,
    drafts: current.drafts,
    verdicts:
      verdicts && typeof verdicts === "object"
        ? { ...(current.verdicts ?? {}), ...(verdicts as Session["verdicts"]) }
        : current.verdicts,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(fileFor(id), JSON.stringify(next, null, 2));
  broadcast(id, next, "session");
  return next;
}

export async function writeSession(session: Session): Promise<Session> {
  session.updatedAt = new Date().toISOString();
  await writeFile(fileFor(session.id), JSON.stringify(session, null, 2));
  broadcast(session.id, session, "session");
  return session;
}

export function subscribe(id: string, fn: (payload: unknown, event: string) => void) {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

export function broadcast(id: string, payload: unknown, event = "session") {
  for (const fn of listeners.get(id) ?? []) fn(payload, event);
}
