import { useEffect, useState } from "react";
import type { Inbox, PrPayload, ReviewEvent, Session } from "./types";

async function json<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function getSessionId(): string | null {
  return new URLSearchParams(window.location.search).get("session");
}

export function useSession(id: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let es: EventSource | undefined;
    json<Session>(`/api/session/${id}`)
      .then(setSession)
      .catch((e: Error) => setError(e.message));
    es = new EventSource(`/api/session/${id}/events`);
    es.addEventListener("session", (ev) => {
      setSession(JSON.parse((ev as MessageEvent).data) as Session);
    });
    es.onerror = () => {
      /* browser reconnects */
    };
    return () => es?.close();
  }, [id]);

  return { session, error, setSession };
}

export const api = {
  inbox: (id: string) => json<Inbox>(`/api/inbox?session=${id}`),
  pr: (id: string, number: number, repo?: string) =>
    json<PrPayload>(
      `/api/pr/${number}?session=${id}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`,
    ),
  patch: (id: string, body: Record<string, unknown>) =>
    json<Session>(`/api/session/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  addDraft: (id: string, body: { path?: string; line?: number; side?: "LEFT" | "RIGHT"; body: string }) =>
    json<Session>(`/api/session/${id}/drafts`, { method: "POST", body: JSON.stringify(body) }),
  deleteDraft: (id: string, draftId: string) =>
    json<Session>(`/api/session/${id}/drafts/${draftId}`, { method: "DELETE" }),
  submit: (id: string, body: { event: ReviewEvent; summary?: string }) =>
    json<{ session: Session }>(`/api/session/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  expand: (id: string, scope: Session["scope"], org?: string) =>
    json<Session>(`/api/session/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ scope, org }),
    }),
};
