import { useEffect, useState } from "react";
import { api } from "../api";
import type { Inbox, InboxPr, InboxSection, Session, Tag } from "../types";

export function InboxView({ session }: { session: Session }) {
  const [inbox, setInbox] = useState<Inbox | undefined>(session.inbox);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.inbox) setInbox(session.inbox);
  }, [session.inbox]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .inbox(session.id)
      .then((data) => {
        if (!cancelled) setInbox(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.id, session.scope, session.repo, session.org]);

  const [copied, setCopied] = useState<string | null>(null);

  async function copyPr(pr: InboxPr) {
    const text = `#${pr.number}`;
    await navigator.clipboard.writeText(text);
    setCopied(`${pr.repo}#${pr.number}`);
    window.setTimeout(() => setCopied(null), 2000);
  }

  const copiedNum = copied?.split("#")[1];

  return (
    <div className="inbox">
      <div className="scope" role="group" aria-label="Inbox scope">
        <button
          type="button"
          aria-pressed={session.scope === "repo"}
          disabled={!session.repo || loading}
          onClick={() => void api.expand(session.id, "repo")}
        >
          Repo
        </button>
        <button
          type="button"
          aria-pressed={session.scope === "org"}
          disabled={loading}
          onClick={() => void api.expand(session.id, "org", session.org ?? session.repo?.split("/")[0])}
        >
          Org
        </button>
        <button
          type="button"
          aria-pressed={session.scope === "account"}
          disabled={loading}
          onClick={() => void api.expand(session.id, "account")}
        >
          Account
        </button>
      </div>
      {loading ? (
        <div className="loader" role="status" aria-live="polite" aria-busy="true">
          <span className="visually-hidden">Loading GitHub PRs</span>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      {!loading ? (
        <p className="inbox-hint muted" role="status">
          {copiedNum ? `Copied #${copiedNum}. Paste it in chat.` : "Click a row to copy #N for chat."}
        </p>
      ) : null}
      {!loading
        ? inbox?.sections.map((section) => (
            <Section key={section.id} section={section} copied={copied} onCopy={copyPr} />
          ))
        : null}
    </div>
  );
}

function Section({
  section,
  copied,
  onCopy,
}: {
  section: InboxSection;
  copied: string | null;
  onCopy: (pr: InboxPr) => void;
}) {
  return (
    <section className="section">
      <h2>{section.label}</h2>
      {section.human.length === 0 && section.bots.length === 0 ? (
        <p className="muted">None</p>
      ) : (
        <div className="pr-list">
          {section.human.map((pr) => (
            <PrRow
              key={`${pr.repo}-${pr.number}`}
              pr={pr}
              copied={copied === `${pr.repo}#${pr.number}`}
              onCopy={onCopy}
            />
          ))}
          {section.bots.length > 0 ? (
            <>
              <div className="bot-sep">Bots</div>
              {section.bots.map((pr) => (
                <PrRow
                  key={`${pr.repo}-${pr.number}`}
                  pr={pr}
                  copied={copied === `${pr.repo}#${pr.number}`}
                  onCopy={onCopy}
                />
              ))}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function PrRow({
  pr,
  copied,
  onCopy,
}: {
  pr: InboxPr;
  copied: boolean;
  onCopy: (pr: InboxPr) => void;
}) {
  return (
    <button type="button" className={`pr-row${copied ? " copied" : ""}`} onClick={() => onCopy(pr)}>
      <span className="num">#{pr.number}</span>
      <span className="title">{pr.title}</span>
      <span className="muted">{pr.repo.replace(/.*\//, "")}</span>
      <span className="tags">
        {copied ? <span className="tag tag-you">Copied</span> : null}
        {pr.tags.map((tag: Tag) => (
          <span key={tag} className={`tag tag-${tag.replace(/\s/g, "").toLowerCase()}`}>
            {tag}
          </span>
        ))}
      </span>
    </button>
  );
}
