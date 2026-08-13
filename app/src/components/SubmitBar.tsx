import { useState } from "react";
import { api } from "../api";
import { unjudgedNotes } from "../ledger";
import type { NoteVerdict, ReviewEvent, Session } from "../types";

export function SubmitBar({
  session,
  draftBody,
  setDraftBody,
  sel,
  onAddDraft,
}: {
  session: Session;
  draftBody: string;
  setDraftBody: (v: string) => void;
  sel: { path: string; line: number; side?: "LEFT" | "RIGHT" } | null;
  onAddDraft: () => Promise<void>;
}) {
  const sent = Boolean(session.submittedAt) && session.drafts.length === 0;
  const [event, setEvent] = useState<ReviewEvent>(session.event ?? "COMMENT");
  const [summary, setSummary] = useState(session.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const unjudged = unjudgedNotes(session.notes, session.verdicts);
  const blocked = unjudged.length > 0;

  function waiveRemaining() {
    const verdicts: Record<string, NoteVerdict> = {};
    for (const n of unjudged) verdicts[n.id] = "waived";
    void api.patch(session.id, { verdicts });
  }

  return (
    <footer className={session.readyToSubmit ? "submit submit-ready" : "submit"}>
      <div className="draft-box">
        <textarea
          rows={2}
          placeholder={sel ? `Draft on ${sel.path}:${sel.line}` : "Draft a general comment, or click + on a line"}
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
        />
        <button type="button" disabled={!draftBody.trim()} onClick={() => void onAddDraft()}>
          Save draft
        </button>
      </div>
      <ul className="draft-list">
        {session.drafts.map((d) => (
          <li key={d.id}>
            <span>
              {d.path ? `${d.path}:${d.line}` : "general"}: {d.body}
            </span>
            <button type="button" onClick={() => void api.deleteDraft(session.id, d.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {session.readyToSubmit ? (
        <>
          {blocked ? (
            <p className="ledger-meta muted">
              {unjudged.length} open {unjudged.length === 1 ? "check" : "checks"}
              <button type="button" onClick={waiveRemaining}>
                Waive remaining
              </button>
            </p>
          ) : null}
          <div className="send-row">
            <select value={event} onChange={(e) => setEvent(e.target.value as ReviewEvent)}>
              <option value="COMMENT">Comment</option>
              <option value="APPROVE">Approve</option>
              <option value="REQUEST_CHANGES">Request changes</option>
            </select>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Review summary"
            />
            <button
              type="button"
              className="primary"
              disabled={busy || sent || blocked || !session.currentPr}
              onClick={async () => {
                setBusy(true);
                setResult(null);
                try {
                  await api.submit(session.id, { event, summary });
                  setResult("Sent to GitHub.");
                } catch (e) {
                  setResult(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {sent ? "Sent" : "Send review"}
            </button>
          </div>
          {result ? <p className="muted">{result}</p> : null}
        </>
      ) : null}
    </footer>
  );
}
