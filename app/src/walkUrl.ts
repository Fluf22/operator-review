import type { Session } from "./types";

export function searchFromSession(s: Session): string {
  const p = new URLSearchParams();
  p.set("session", s.id);
  if (s.mode !== "inbox" && s.currentPr) {
    p.set("pr", String(s.currentPr));
    if (s.activeGroup) p.set("group", s.activeGroup);
    if (s.activeNote) p.set("note", s.activeNote);
    if (s.focus?.path) p.set("path", s.focus.path);
    if (s.focus?.line != null) p.set("line", String(s.focus.line));
  }
  return `?${p.toString()}`;
}

/** If the URL names a PR, treat it as intent and PATCH the session to match. */
export function patchFromSearch(s: Session, search = window.location.search): Record<string, unknown> | null {
  const p = new URLSearchParams(search);
  const prRaw = p.get("pr");
  if (!prRaw) return null;

  const pr = Number(prRaw);
  if (!Number.isFinite(pr)) return null;

  const patch: Record<string, unknown> = {};
  if (s.currentPr !== pr || s.mode === "inbox") {
    patch.currentPr = pr;
    patch.mode = "walk";
  }

  const group = p.get("group");
  if (group) {
    if (s.activeGroup !== group) patch.activeGroup = group;
  } else if (s.activeGroup) {
    patch.activeGroup = null;
  }

  const note = p.get("note");
  if (note) {
    if (s.activeNote !== note) patch.activeNote = note;
  }

  const path = p.get("path");
  if (path) {
    const lineRaw = p.get("line");
    const line = lineRaw ? Number(lineRaw) : undefined;
    if (s.focus?.path !== path || s.focus?.line !== line) {
      patch.focus = { path, ...(line != null && Number.isFinite(line) ? { line } : {}) };
    }
  }

  return Object.keys(patch).length ? patch : null;
}

export function syncWalkUrl(s: Session) {
  const next = searchFromSession(s);
  if (window.location.search !== next) {
    history.replaceState(null, "", next);
  }
}
