export type NoteVerdict = "judged" | "waived";

export type WalkCard =
  | { kind: "summary"; text: string }
  | { kind: "note"; note: { id: string; path?: string; line?: number; kind?: "explain" | "check"; glance?: boolean } }
  | { kind: "done" };

export function isCheckNote<T extends { kind?: "explain" | "check"; glance?: boolean }>(note: T): boolean {
  return note.kind === "check" && !note.glance;
}

export function loadBearingNotes<T extends { id: string; kind?: "explain" | "check"; glance?: boolean }>(
  notes: T[] | undefined,
): T[] {
  return (notes ?? []).filter((n) => isCheckNote(n));
}

export function unjudgedNotes<T extends { id: string; kind?: "explain" | "check"; glance?: boolean }>(
  notes: T[] | undefined,
  verdicts: Record<string, NoteVerdict> | undefined,
): T[] {
  return loadBearingNotes(notes).filter((n) => !verdicts?.[n.id]);
}

export function activeNoteFromCard(card: WalkCard | undefined): string {
  if (!card || card.kind === "summary") return "summary";
  if (card.kind === "done") return "done";
  return card.note.id;
}

export function indexForActiveNote(cards: WalkCard[], activeNote: string | undefined): number {
  if (!cards.length) return 0;
  if (!activeNote || activeNote === "summary") {
    const i = cards.findIndex((c) => c.kind === "summary");
    return i >= 0 ? i : 0;
  }
  if (activeNote === "done") {
    const i = cards.findIndex((c) => c.kind === "done");
    return i >= 0 ? i : cards.length - 1;
  }
  const i = cards.findIndex((c) => c.kind === "note" && c.note.id === activeNote);
  return i >= 0 ? i : 0;
}
