import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { PrPayload, Session } from "./types";
import { InboxView } from "./components/InboxView";
import { WalkReady } from "./components/WalkReady";
import { patchFromSearch, syncWalkUrl } from "./walkUrl";

export function App() {
  const id = new URLSearchParams(window.location.search).get("session");
  const { session, error } = useSessionSafe(id);

  if (!id) {
    return (
      <main className="empty">
        <p>No session. Open this page with ?session=id (optional pr and group query params).</p>
      </main>
    );
  }
  if (error) return <main className="empty error">Failed to load session: {error}</main>;
  if (!session) return <main className="empty muted">Loading session</main>;

  const walking = session.mode !== "inbox" && session.currentPr;

  return (
    <div className="shell">
      {walking ? (
        <Walk session={session} />
      ) : (
        <>
          <header className="top">
            <span className="brand">Review</span>
            <span className="top-meta muted">{session.repo ?? session.org ?? session.scope}</span>
          </header>
          <InboxView session={session} />
        </>
      )}
    </div>
  );
}

function useSessionSafe(id: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const appliedUrl = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    appliedUrl.current = false;
    fetch(`/api/session/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<Session>;
      })
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    const es = new EventSource(`/api/session/${id}/events`);
    es.addEventListener("session", (ev) => {
      if (!cancelled) setSession(JSON.parse((ev as MessageEvent).data) as Session);
    });
    return () => {
      cancelled = true;
      es.close();
    };
  }, [id]);

  useEffect(() => {
    if (!session) return;
    if (!appliedUrl.current) {
      appliedUrl.current = true;
      const patch = patchFromSearch(session);
      if (patch) {
        void api.patch(session.id, patch);
        return;
      }
    }
    syncWalkUrl(session);
  }, [session]);

  return { session, error };
}

function Walk({ session }: { session: Session }) {
  const [payload, setPayload] = useState<PrPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!session.currentPr) return;
    setPayload(null);
    api
      .pr(session.id, session.currentPr, session.repo)
      .then(setPayload)
      .catch((e: Error) => setErr(e.message));
  }, [session.id, session.currentPr, session.repo]);

  if (err) return <div className="walk-status error">{err}</div>;
  if (!payload) return <div className="walk-status">Loading diff</div>;
  return <WalkReady session={session} payload={payload} />;
}
