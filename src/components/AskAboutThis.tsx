"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { MessageSquareIcon } from "lucide-react";
import { isChartBlockType } from "./dashboardEditorController";

type EditorLike = {
  getBlock(id: string): { type: string; props?: Record<string, unknown> } | undefined;
  getTextCursorPosition(): { block: { id: string } };
  onSelectionChange(callback: () => void): (() => void) | void;
};

const BLOCK_SELECTOR = '[data-node-type="blockContainer"]';

/**
 * Shows one "Ask about this" button over the hovered or selected Chart block. Works from the
 * DOM, so the Chart block specs stay untouched and the embed (which passes no `onAsk`) is unchanged.
 */
export function AskAboutThisHost({
  editor,
  onAsk,
  children,
}: {
  editor: EditorLike;
  onAsk?: (chartId: string) => void;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<{ blockId: string; top: number; right: number } | null>(null);
  const hoverIdRef = useRef<string | null>(null);

  const place = useCallback(
    (blockId: string | null) => {
      const host = hostRef.current;
      if (!onAsk || !host || !blockId) return setTarget(null);
      const block = editor.getBlock(blockId);
      const chartId = block?.props?.chartId;
      const el = host.querySelector(`[data-id="${CSS.escape(blockId)}"]`);
      if (!block || !isChartBlockType(block.type) || typeof chartId !== "string" || !chartId || !el) {
        return setTarget(null);
      }
      const hostRect = host.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      setTarget({ blockId, top: rect.top - hostRect.top + 8, right: hostRect.right - rect.right + 8 });
    },
    [editor, onAsk]
  );

  // Selecting (cursor in) a Chart block shows the action too, for keyboard users.
  useEffect(() => {
    if (!onAsk) return;
    return editor.onSelectionChange(() => {
      if (hoverIdRef.current) return;
      try {
        place(editor.getTextCursorPosition().block.id);
      } catch {
        setTarget(null);
      }
    });
  }, [editor, onAsk, place]);

  if (!onAsk) return <>{children}</>;

  const chartId = target ? (editor.getBlock(target.blockId)?.props?.chartId as string | undefined) : undefined;

  return (
    <div
      ref={hostRef}
      style={{ position: "relative" }}
      onMouseOver={(event) => {
        const element = event.target as HTMLElement;
        if (element.closest("[data-qp-ask-about]")) return;
        const id = element.closest(BLOCK_SELECTOR)?.getAttribute("data-id") ?? null;
        hoverIdRef.current = id;
        place(id);
      }}
      onMouseLeave={() => {
        hoverIdRef.current = null;
        setTarget(null);
      }}
    >
      {children}
      {target && chartId && (
        <button
          type="button"
          data-qp-ask-about
          className="qp-ask-about"
          style={{ top: target.top, right: target.right }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAsk(chartId)}
        >
          <MessageSquareIcon size={14} />
          Ask about this
        </button>
      )}
    </div>
  );
}
