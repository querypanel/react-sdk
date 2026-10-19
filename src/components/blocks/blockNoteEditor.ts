/**
 * Minimal BlockNote surface used by pinned chart blocks for prop updates.
 * Keeps both chart block factories on one typed contract instead of ad-hoc casts.
 */
export type BlockNoteEditorLike = {
  isEditable?: boolean;
  updateBlock: (
    block: unknown,
    update: { props: Record<string, unknown> }
  ) => void;
};

export function getBlockNoteEditor(
  props: { editor?: unknown } | Record<string, unknown>
): BlockNoteEditorLike | undefined {
  const editor = (props as { editor?: unknown }).editor;
  if (!editor || typeof editor !== "object") return undefined;
  const candidate = editor as Partial<BlockNoteEditorLike>;
  if (typeof candidate.updateBlock !== "function") return undefined;
  return candidate as BlockNoteEditorLike;
}
