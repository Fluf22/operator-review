import { parsePatchFiles, type CodeViewItem } from "@pierre/diffs";
import { CodeView, type CodeViewHandle, type CodeViewReactOptions } from "@pierre/diffs/react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api } from "../api";
import { activeNoteFromCard, indexForActiveNote, isCheckNote, unjudgedNotes } from "../ledger";
import type { InboxPr, PrPayload, Session, WalkNote } from "../types";
import { SubmitBar } from "./SubmitBar";

export type LineSel = { path: string; line: number; end: number; side: "LEFT" | "RIGHT" };

const CHEVRON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M15 5 8 12l7 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function WalkDock({ session, hidden }: { session: Session; hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const groups = session.groups ?? [];
  const whole = !session.activeGroup;
  const current = groups.find((g) => g.id === session.activeGroup);
  const activeIndex = groups.findIndex((g) => g.id === session.activeGroup);
  const at = whole ? -1 : activeIndex;
  const prev = at > 0 ? groups[at - 1] : undefined;
  const next = whole ? groups[0] : at >= 0 && at < groups.length - 1 ? groups[at + 1] : undefined;
  const label = whole || !current ? "Whole PR" : current.label;

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (t?.closest(".walk-dock")) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!groups.length) return null;

  function go(id: string | null | undefined) {
    if (id === undefined) return;
    setOpen(false);
    void api.patch(session.id, { activeGroup: id, activeNote: "summary" });
  }

  return (
    <nav className="walk-dock" aria-label="Review walk" hidden={hidden}>
      {open ? (
        <ul className="walk-picker" role="listbox" aria-label="Walk groups">
          {groups.map((g) => {
            const selected = !whole && g.id === session.activeGroup;
            return (
              <li key={g.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={selected ? "is-active" : undefined}
                  onClick={() => go(g.id)}
                >
                  {g.label}
                </button>
              </li>
            );
          })}
          <li role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={whole}
              className={whole ? "is-active" : undefined}
              onClick={() => go(null)}
            >
              Whole PR
            </button>
          </li>
        </ul>
      ) : null}
      <div className="walk-dock-bar">
        <button
          type="button"
          className="walk-step"
          aria-label={prev ? `Previous group: ${prev.label}` : "Previous group"}
          disabled={!prev}
          onClick={() => go(prev?.id)}
        >
          {CHEVRON}
        </button>
        <button
          type="button"
          className="walk-tab"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="walk-tab-label">{label}</span>
          <svg className="walk-tab-caret" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="walk-step walk-step-next"
          aria-label={next ? `Next group: ${next.label}` : "Next group"}
          disabled={!next}
          onClick={() => go(next?.id)}
        >
          {CHEVRON}
        </button>
      </div>
    </nav>
  );
}

function WalkNotes({
  session,
  viewer,
  hidden,
}: {
  session: Session;
  viewer: RefObject<CodeViewHandle<undefined> | null>;
  hidden: boolean;
}) {
  const [min, setMin] = useState(false);
  const group = session.groups?.find((g) => g.id === session.activeGroup);
  const summary = session.activeGroup ? (group?.why ?? session.brief) : session.brief;
  const notes = useMemo(() => {
    const all = session.notes ?? [];
    if (!session.activeGroup) return all;
    return all.filter((n) => n.group === session.activeGroup);
  }, [session.notes, session.activeGroup]);
  const groups = session.groups ?? [];
  const at = !session.activeGroup ? -1 : groups.findIndex((g) => g.id === session.activeGroup);
  const nextGroup = !session.activeGroup ? groups[0] : at >= 0 ? groups[at + 1] : undefined;
  const cards = useMemo(() => {
    const list: Array<
      { kind: "summary"; text: string } | { kind: "note"; note: WalkNote } | { kind: "done" }
    > = [];
    if (summary) list.push({ kind: "summary", text: summary });
    for (const note of notes) list.push({ kind: "note", note });
    list.push({ kind: "done" });
    return list;
  }, [summary, notes]);
  const cursorNote = session.notes?.find((n) => n.id === session.activeNote);
  const step = indexForActiveNote(cards, session.activeNote ?? undefined);
  const card = cards[step];
  const note = card?.kind === "note" ? card.note : undefined;
  const left = unjudgedNotes(session.notes, session.verdicts).length;
  const judged = note && isCheckNote(note) ? session.verdicts?.[note.id] : undefined;
  const checking = Boolean(note && isCheckNote(note));

  useEffect(() => {
    setMin(false);
  }, [session.activeNote, session.activeGroup]);

  useEffect(() => {
    const id = session.activeNote;
    if (!id || id === "summary" || id === "done") return;
    if (notes.some((n) => n.id === id)) return;
    if (!cursorNote?.group || cursorNote.group === session.activeGroup) return;
    void api.patch(session.id, { activeGroup: cursorNote.group });
  }, [session.activeNote, session.activeGroup, session.id, notes, cursorNote]);

  useEffect(() => {
    if (hidden || min || !note?.path) return;
    const path = note.path;
    const line = note.line ?? 1;
    viewer.current?.scrollTo({
      type: "line",
      id: `diff:${path}`,
      lineNumber: line,
      align: "center",
    });
    let tries = 0;
    let raf = 0;
    const tick = () => {
      if (flashDiffHunk(viewer.current, path, line)) return;
      if (++tries < 16) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hidden, min, note?.id, note?.path, note?.line, viewer]);

  function goGroup(id: string | null) {
    setMin(false);
    void api.patch(session.id, { activeGroup: id, activeNote: "summary" });
  }

  function goStep(next: number) {
    const target = cards[next];
    if (!target) return;
    const activeNote = activeNoteFromCard(target);
    const patch: Record<string, unknown> = { activeNote };
    if (target.kind === "note" && target.note.path) {
      patch.focus = {
        path: target.note.path,
        line: target.note.line ?? 1,
        group: session.activeGroup ?? undefined,
      };
    }
    void api.patch(session.id, patch);
  }

  if (hidden || cards.length === 0) return null;

  if (min) {
    return (
      <button
        type="button"
        className={checking ? "walk-notes walk-notes-min is-check" : "walk-notes walk-notes-min"}
        aria-label="Open walk notes"
        onClick={() => setMin(false)}
      >
        <NotesIcon />
      </button>
    );
  }

  const meta = [
    note?.path
      ? `${note.path.split("/").pop()}${note.line ? `:${note.line}` : ""}`
      : card?.kind === "summary"
        ? "Summary"
        : card?.kind === "done"
          ? "Done"
          : null,
    judged ? (judged === "waived" ? "Waived" : "Owned") : checking ? "Open" : null,
    left > 0 ? `${left} left` : null,
    `${step + 1} / ${cards.length}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const kicker =
    card?.kind === "summary" ? "Summary" : card?.kind === "done" ? "Done" : checking ? "Check" : "Explain";

  return (
    <aside className={checking ? "walk-notes is-check" : "walk-notes"} aria-label="Walk notes">
      <header className="walk-notes-head">
        <span className="walk-notes-kicker muted">{kicker}</span>
        <button
          type="button"
          className="walk-notes-minbtn"
          aria-label="Back to summary"
          disabled={step <= 0}
          onClick={() => goStep(0)}
        >
          <FirstIcon />
        </button>
        <button type="button" className="walk-notes-minbtn" aria-label="Minimize notes" onClick={() => setMin(true)}>
          <MinIcon />
        </button>
      </header>
      <div className="walk-notes-body">
        {card?.kind === "summary" ? (
          <p>{card.text}</p>
        ) : card?.kind === "done" ? (
          <>
            <p>Done! ✅</p>
            {nextGroup ? (
              <button type="button" className="primary" onClick={() => goGroup(nextGroup.id)}>
                Next: {nextGroup.label}
              </button>
            ) : session.activeGroup ? (
              <button type="button" onClick={() => goGroup(null)}>
                Whole PR
              </button>
            ) : (
              <p className="muted">That's the last group.</p>
            )}
          </>
        ) : note ? (
          <>
            <p>{note.body}</p>
            {checking && note.concern ? <p className="walk-notes-concern">{note.concern}</p> : null}
          </>
        ) : null}
      </div>
      <footer className="walk-notes-foot">
        <span className="walk-notes-meta muted">{meta}</span>
        <div className="walk-notes-steps">
          <button
            type="button"
            className="walk-step walk-step-up"
            aria-label="Previous note"
            disabled={step <= 0}
            onClick={() => goStep(step - 1)}
          >
            {CHEVRON}
          </button>
          <button
            type="button"
            className="walk-step walk-step-down"
            aria-label="Next note"
            disabled={step >= cards.length - 1}
            onClick={() => goStep(step + 1)}
          >
            {CHEVRON}
          </button>
        </div>
      </footer>
    </aside>
  );
}

const TREE_SEARCH_ICON = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="oklch(0.5 0.01 260)" stroke-width="1.5" stroke-linecap="round"><circle cx="5.2" cy="5.2" r="3.2"/><path d="M7.6 7.6 10 10"/></svg>`,
);

function pathFromItemId(id: string | undefined) {
  if (!id?.startsWith("diff:")) return undefined;
  return id.slice("diff:".length);
}

function hunkRange(item: { fileDiff?: { hunks?: { additionStart: number; additionCount: number }[] } }, line: number) {
  for (const hunk of item.fileDiff?.hunks ?? []) {
    const start = hunk.additionStart;
    const end = start + Math.max(hunk.additionCount, 1) - 1;
    if (line >= start && line <= end) return { start, end };
  }
  return { start: line, end: line };
}

function lineNodes(host: HTMLElement, start: number, end: number) {
  const roots: ParentNode[] = [host];
  if (host.shadowRoot) roots.push(host.shadowRoot);
  for (const node of host.shadowRoot?.querySelectorAll("*") ?? []) {
    if (node instanceof HTMLElement && node.shadowRoot) roots.push(node.shadowRoot);
  }
  const found: HTMLElement[] = [];
  for (const root of roots) {
    for (let n = start; n <= end; n++) {
      for (const el of root.querySelectorAll(`[data-line="${n}"]`)) {
        if (el instanceof HTMLElement) found.push(el);
      }
    }
  }
  return found;
}

function flashDiffHunk(handle: CodeViewHandle<undefined> | null, path: string, line: number) {
  const rendered = handle?.getInstance()?.getRenderedItems();
  const item = rendered?.find((entry) => entry.id === `diff:${path}`);
  if (!item?.element) return false;
  const range = hunkRange(item.item, line);
  const nodes = lineNodes(item.element, range.start, range.end);
  if (!nodes.length) return false;
  for (const el of nodes) {
    el.classList.remove("walk-flash");
    void el.offsetWidth;
    el.classList.add("walk-flash");
    const done = () => {
      el.classList.remove("walk-flash");
      el.removeEventListener("animationend", done);
    };
    el.addEventListener("animationend", done);
  }
  return true;
}

export function WalkReady({ session, payload }: { session: Session; payload: PrPayload }) {
  const [draftBody, setDraftBody] = useState("");
  const [sel, setSel] = useState<LineSel | null>(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const viewer = useRef<CodeViewHandle<undefined>>(null);
  const filesRef = useRef<PrPayload["files"]>([]);

  function applySelection(path: string | undefined, start: number, end: number, side?: string) {
    if (!path) return;
    setSel({
      path,
      line: start,
      end,
      side: side === "deletions" || side === "LEFT" ? "LEFT" : "RIGHT",
    });
  }

  function clearSelection() {
    viewer.current?.clearSelectedLines();
    setSel(null);
  }

  const files = useMemo(() => {
    const group = session.groups?.find((g) => g.id === session.activeGroup);
    if (!group) return payload.files;
    return payload.files.filter((f) => group.paths.includes(f.filename));
  }, [payload, session.groups, session.activeGroup]);
  filesRef.current = files;

  const items = useMemo<CodeViewItem[]>(() => {
    return files.flatMap((file) => {
      if (!file.patch) return [];
      const wrapped = `--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}\n`;
      const parsed = parsePatchFiles(wrapped, `${session.currentPr}-${file.filename}`);
      const fileDiff = parsed[0]?.files[0];
      if (!fileDiff) return [];
      const annotations = payload.comments
        .filter((c) => c.path === file.filename && c.line)
        .map((c) => ({
          side: "additions" as const,
          lineNumber: c.line as number,
        }));
      return [
        {
          id: `diff:${file.filename}`,
          type: "diff" as const,
          fileDiff,
          annotations,
        },
      ];
    });
  }, [files, payload.comments, session.currentPr]);

  const paths = useMemo(() => files.map((f) => f.filename), [files]);
  const gitStatus = useMemo(
    () =>
      files.map((f) => ({
        path: f.filename,
        status:
          f.status === "added"
            ? ("added" as const)
            : f.status === "removed"
              ? ("deleted" as const)
              : f.status === "renamed"
                ? ("renamed" as const)
                : ("modified" as const),
      })),
    [files],
  );

  const { model } = useFileTree({
    paths,
    gitStatus,
    initialExpansion: "open",
    search: true,
    density: "compact",
    unsafeCSS: `
      :host {
        color-scheme: light dark;
        background: var(--panel) !important;
        color: var(--text);
        --trees-accent: var(--accent);
        --trees-focus-ring-color: var(--accent);
        --trees-focus-ring-width: 2px;
        --trees-focus-ring-offset: 2px;
      }

      [data-file-tree-search-container] {
        padding: 8px 8px 8px;
        margin: 0;
        border-bottom: 1px solid var(--line);
      }

      [data-file-tree-search-input] {
        height: 28px;
        line-height: 28px;
        font-size: 12px;
        font-weight: 400;
        border: 0;
        border-radius: 4px;
        padding: 0 8px 0 28px;
        background-color: var(--bg);
        background-image: url("data:image/svg+xml,${TREE_SEARCH_ICON}");
        background-repeat: no-repeat;
        background-position: 8px 50%;
        background-size: 12px;
      }

      [data-file-tree-search-input]::placeholder {
        color: var(--muted);
        font-weight: 400;
      }

      [data-item-git-status] > [data-item-section="content"] {
        color: var(--text);
      }

      [data-item-git-status] > [data-item-section="icon"] > :not([data-icon-name="file-tree-icon-chevron"]) {
        color: var(--muted);
      }
    `,
    onSelectionChange(selected) {
      const match = selected.find((p) => filesRef.current.some((f) => f.filename === p));
      if (!match) return;
      viewer.current?.scrollTo({ type: "item", id: `diff:${match}`, align: "start" });
      setTreeOpen(false);
    },
  });

  const pathKey = paths.join("\0");
  useEffect(() => {
    const dirs = new Set<string>();
    for (const p of paths) {
      const parts = p.split("/");
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i]!;
        dirs.add(acc);
      }
    }
    model.resetPaths(paths, { initialExpandedPaths: [...dirs] });
    model.setGitStatus(gitStatus);
  }, [model, pathKey, gitStatus, paths]);

  const scheme = useColorScheme();
  const codeViewOptions = useMemo<CodeViewReactOptions>(
    () => ({
      theme: { dark: "pierre-dark", light: "pierre-light" },
      themeType: scheme,
      stickyHeaders: true,
      diffStyle: "unified",
      enableLineSelection: true,
      enableGutterUtility: true,
      layout: { paddingTop: 8, paddingBottom: 8, gap: 12 },
      unsafeCSS: `
        :host {
          color-scheme: light dark;
          --diffs-font-family: "Fira Code", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          --diffs-font-features: "calt" 1, "liga" 1;
          --diffs-header-font-family: ui-sans-serif, system-ui, sans-serif;
          --diffs-light-bg: var(--paper);
          --diffs-dark-bg: var(--ink);
          --diffs-light: var(--fg-paper);
          --diffs-dark: var(--fg-ink);
        }
        @keyframes walk-flash {
          0%, 45%, 55%, 100% {
            box-shadow: inset 0 0 0 999px transparent;
          }
          12%, 32%, 68%, 88% {
            box-shadow: inset 0 0 0 999px light-dark(oklch(0.32 0.012 260 / 0.22), oklch(0.92 0.004 260 / 0.3));
          }
        }
        [data-line].walk-flash {
          animation: walk-flash 900ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes walk-flash {
            0% {
              box-shadow: inset 0 0 0 999px light-dark(oklch(0.32 0.012 260 / 0.18), oklch(0.92 0.004 260 / 0.24));
            }
            100% {
              box-shadow: inset 0 0 0 999px transparent;
            }
          }
          [data-line].walk-flash {
            animation-duration: 500ms;
          }
        }
      `,
      onGutterUtilityClick(range, context) {
        const path = pathFromItemId(
          (context as { item?: { id: string } } | undefined)?.item?.id,
        );
        applySelection(path, range.start, range.end ?? range.start, range.side);
      },
    }),
    [scheme],
  );

  useEffect(() => {
    const focus = session.focus;
    if (!focus?.path) return;
    viewer.current?.scrollTo({
      type: "line",
      id: `diff:${focus.path}`,
      lineNumber: focus.line ?? 1,
      align: "center",
    });
    if (focus.commentId && focus.line) applySelection(focus.path, focus.line, focus.line);
  }, [session.focus?.path, session.focus?.line, session.focus?.commentId]);

  useEffect(() => {
    function onPointerDown(ev: PointerEvent) {
      const t = ev.target as HTMLElement | null;
      if (t?.closest(".comment-pop, .tree-files, .fab-tree, .walk-dock, .walk-notes")) return;
      if (t?.closest(".diffs")) return;
      if (sel) clearSelection();
      if (treeOpen) setTreeOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== "Escape") return;
      if (treeOpen) setTreeOpen(false);
      if (sel) clearSelection();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sel, treeOpen]);

  async function saveDraft() {
    if (!draftBody.trim()) return;
    await api.addDraft(session.id, {
      path: sel?.path,
      line: sel?.line,
      side: sel?.side ?? "RIGHT",
      body: draftBody,
    });
    setDraftBody("");
    clearSelection();
  }

  const prMeta: InboxPr = {
    number: session.currentPr!,
    title: payload.pr.title,
    url: payload.pr.html_url,
    repo: payload.repo,
    author: payload.pr.user.login,
    updatedAt: session.updatedAt,
    tags: [],
    bot: false,
  };

  const dockVisible = Boolean(session.groups?.length) && !sel && !treeOpen;
  const notesHidden = Boolean(sel) || treeOpen;

  return (
    <>
      <div className="walk">
        <aside className="sidebar">
          <div className="pr-head">
            <a href={prMeta.url} target="_blank" rel="noreferrer">
              #{prMeta.number}
            </a>{" "}
            {prMeta.title}
          </div>
          {treeOpen ? (
            <button
              type="button"
              className="tree-scrim"
              aria-label="Close file tree"
              onClick={() => setTreeOpen(false)}
            />
          ) : null}
          <div className={`tree-files${treeOpen ? " is-open" : ""}`}>
            <FileTree model={model} style={{ height: "100%" }} />
          </div>
          {payload.comments.length > 0 ? (
            <div className="thread-list">
              <div className="bot-sep">Threads</div>
              {payload.comments.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="pr-row"
                  onClick={() =>
                    void api.patch(session.id, {
                      focus: { path: c.path, line: c.line ?? undefined, commentId: String(c.id) },
                    })
                  }
                >
                  <span className="title">
                    {c.user.login}: {c.body.slice(0, 80)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </aside>
        <section className="diffs">
          <div className="diffs-body">
            <CodeView
              ref={viewer}
              items={items}
              style={{ height: "100%", overflow: "auto", paddingBottom: dockVisible ? 72 : 0 }}
              options={codeViewOptions}
              onSelectedLinesChange={(selection) => {
                if (!selection) {
                  setSel(null);
                  return;
                }
                applySelection(
                  pathFromItemId(selection.id),
                  selection.range.start,
                  selection.range.end,
                  selection.range.side,
                );
              }}
            />
          </div>
          <WalkNotes session={session} viewer={viewer} hidden={notesHidden} />
        </section>
        <WalkDock session={session} hidden={!dockVisible} />
      </div>
      {sel ? (
        <form
          className="comment-pop"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDraft();
          }}
        >
          <p className="comment-pop-meta muted">
            {sel.path}:{sel.line}
            {sel.end !== sel.line ? `-${sel.end}` : ""}
          </p>
          <textarea
            rows={3}
            placeholder="Comment on this range"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void saveDraft();
              }
            }}
          />
          <div className="comment-pop-actions">
            <button type="button" onClick={clearSelection}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!draftBody.trim()}>
              Save draft
            </button>
          </div>
        </form>
      ) : null}
      <button
        type="button"
        className="fab-tree"
        aria-label={treeOpen ? "Close file tree" : "Open file tree"}
        aria-expanded={treeOpen}
        hidden={Boolean(sel)}
        onClick={() => setTreeOpen((open) => !open)}
      >
        <TreeIcon />
      </button>
      <SubmitBar
        session={session}
        draftBody={draftBody}
        setDraftBody={setDraftBody}
        sel={sel}
        onAddDraft={saveDraft}
      />
    </>
  );
}

function useColorScheme(): "light" | "dark" {
  const [scheme, setScheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setScheme(mq.matches ? "dark" : "light");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return scheme;
}

function NotesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        d="M3.5 4.5h9M3.5 8h9M3.5 11.5h6"
      />
    </svg>
  );
}

function FirstIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 2.5v7M9.5 2.5 5.5 6l4 3.5"
      />
    </svg>
  );
}

function MinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" d="M2.5 6h7" />
    </svg>
  );
}

function TreeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2H2v4h4V2zm8 0H8v2h6V2zM8 6h6v2H8V6zM6 8H2v6h4V8zm8 4H8v2h6v-2z"
      />
    </svg>
  );
}
