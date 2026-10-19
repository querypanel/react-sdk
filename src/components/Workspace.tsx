"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronsLeftIcon, ChevronsRightIcon, SparklesIcon, XIcon } from "lucide-react";
import {
  clampAssistantWidth,
  COLLAPSED_RAIL_WIDTH,
  DEFAULT_STORAGE_KEY,
  DEFAULT_WORKSPACE_STATE,
  getBrowserStorage,
  loadWorkspaceState,
  resolveLayoutMode,
  saveWorkspaceState,
  widthFromDrag,
  type WorkspacePersistedState,
} from "./workspaceLayout";
import "./Workspace.css";

const KEYBOARD_STEP = 24;

export interface WorkspaceHandle {
  /** Expand the rail / open the drawer, then focus the Assistant prompt. */
  openAssistant: () => void;
}

export interface WorkspaceProps {
  /** The Dashboard (left). */
  dashboard: ReactNode;
  /**
   * The Assistant (right). `focusRequest` increments each time the host asks for focus; pass it on
   * to the panel. The Assistant stays mounted while collapsed so the conversation is kept.
   */
  renderAssistant: (context: { focusRequest: number }) => ReactNode;
  darkMode?: boolean;
  /** localStorage key for pane width and collapsed state. */
  storageKey?: string;
  /** Label on the Assistant header and the collapsed rail. */
  assistantTitle?: string;
  className?: string;
}

export const Workspace = forwardRef<WorkspaceHandle, WorkspaceProps>(function Workspace(
  {
    dashboard,
    renderAssistant,
    darkMode = false,
    storageKey = DEFAULT_STORAGE_KEY,
    assistantTitle = "Assistant",
    className = "",
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [layout, setLayout] = useState<WorkspacePersistedState>(DEFAULT_WORKSPACE_STATE);
  const [restored, setRestored] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const mode = resolveLayoutMode(containerWidth);
  const isDrawer = mode === "drawer";
  const width = clampAssistantWidth(layout.width, containerWidth);
  const railCollapsed = !isDrawer && layout.collapsed;
  const assistantVisible = isDrawer ? drawerOpen : !layout.collapsed;

  // Restore after mount so server and first client render agree.
  useEffect(() => {
    setLayout(loadWorkspaceState(getBrowserStorage(), storageKey));
    setRestored(true);
  }, [storageKey]);

  useEffect(() => {
    if (!restored) return;
    saveWorkspaceState(getBrowserStorage(), layout, storageKey);
  }, [restored, layout, storageKey]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const setWidth = useCallback(
    (next: number) =>
      setLayout((prev) => ({ ...prev, width: clampAssistantWidth(next, containerWidth) })),
    [containerWidth]
  );

  const openAssistant = useCallback(() => {
    if (isDrawer) setDrawerOpen(true);
    else setLayout((prev) => (prev.collapsed ? { ...prev, collapsed: false } : prev));
    setFocusRequest((n) => n + 1);
  }, [isDrawer]);

  useImperativeHandle(ref, () => ({ openAssistant }), [openAssistant]);

  const toggleCollapsed = () => setLayout((prev) => ({ ...prev, collapsed: !prev.collapsed }));

  const onDividerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };
  const onDividerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag) setWidth(widthFromDrag(drag.startWidth, drag.startX, event.clientX));
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };
  const onDividerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setWidth(width + KEYBOARD_STEP);
    else if (event.key === "ArrowRight") setWidth(width - KEYBOARD_STEP);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={rootRef}
      className={`qp-workspace ${className}`}
      data-mode={mode}
      data-theme={darkMode ? "dark" : "light"}
    >
      <div className="qp-workspace-dashboard">{dashboard}</div>

      {!isDrawer && !layout.collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Assistant"
          aria-valuenow={width}
          tabIndex={0}
          className="qp-workspace-divider"
          data-dragging={dragging ? "true" : undefined}
          onPointerDown={onDividerPointerDown}
          onPointerMove={onDividerPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onDividerKeyDown}
        />
      )}

      <aside
        className="qp-workspace-assistant"
        aria-label={assistantTitle}
        data-collapsed={railCollapsed ? "true" : "false"}
        data-open={isDrawer ? String(drawerOpen) : undefined}
        style={isDrawer ? undefined : { width: railCollapsed ? COLLAPSED_RAIL_WIDTH : width }}
      >
        <div className="qp-workspace-assistant-header">
          {railCollapsed ? (
            <>
              <button
                type="button"
                className="qp-workspace-icon-button"
                onClick={toggleCollapsed}
                aria-label={`Expand ${assistantTitle}`}
                aria-expanded={false}
              >
                <ChevronsLeftIcon size={16} />
              </button>
              <span className="qp-workspace-rail-label">{assistantTitle}</span>
            </>
          ) : (
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <SparklesIcon size={16} />
                {assistantTitle}
              </span>
              <button
                type="button"
                className="qp-workspace-icon-button"
                onClick={isDrawer ? () => setDrawerOpen(false) : toggleCollapsed}
                aria-label={isDrawer ? `Close ${assistantTitle}` : `Collapse ${assistantTitle}`}
                aria-expanded={true}
              >
                {isDrawer ? <XIcon size={16} /> : <ChevronsRightIcon size={16} />}
              </button>
            </>
          )}
        </div>
        <div className="qp-workspace-assistant-body" hidden={!assistantVisible}>
          {renderAssistant({ focusRequest })}
        </div>
      </aside>

      {isDrawer && drawerOpen && (
        <button
          type="button"
          className="qp-workspace-backdrop"
          aria-label={`Close ${assistantTitle}`}
          onClick={() => setDrawerOpen(false)}
        />
      )}
      {isDrawer && !drawerOpen && (
        <button type="button" className="qp-workspace-fab" onClick={openAssistant}>
          <SparklesIcon size={16} />
          {assistantTitle}
        </button>
      )}
    </div>
  );
});
