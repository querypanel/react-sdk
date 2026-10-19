/** Pure layout logic for the Workspace (Dashboard left, Assistant right). No React, no DOM. */

export type WorkspaceLayoutMode = "split" | "drawer";

export interface WorkspacePersistedState {
  /** Assistant pane width in px. */
  width: number;
  collapsed: boolean;
}

/** Below this container width the Assistant becomes a drawer over the Dashboard. */
export const DRAWER_BREAKPOINT = 900;
export const MIN_ASSISTANT_WIDTH = 320;
export const MAX_ASSISTANT_WIDTH = 640;
export const DEFAULT_ASSISTANT_WIDTH = 420;
/** Width the Dashboard keeps no matter how wide the Assistant is dragged. */
export const MIN_DASHBOARD_WIDTH = 360;
export const COLLAPSED_RAIL_WIDTH = 44;
export const DEFAULT_STORAGE_KEY = "qp-workspace:v1";

export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

export const DEFAULT_WORKSPACE_STATE: WorkspacePersistedState = {
  width: DEFAULT_ASSISTANT_WIDTH,
  collapsed: false,
};

/** Unknown width (not measured yet) counts as split so desktop never flashes a drawer. */
export function resolveLayoutMode(containerWidth: number): WorkspaceLayoutMode {
  return containerWidth > 0 && containerWidth < DRAWER_BREAKPOINT ? "drawer" : "split";
}

/** Clamp the Assistant width; the Dashboard keeps MIN_DASHBOARD_WIDTH when the container is known. */
export function clampAssistantWidth(width: number, containerWidth = 0): number {
  const finite = Number.isFinite(width) ? width : DEFAULT_ASSISTANT_WIDTH;
  const max =
    containerWidth > 0
      ? Math.max(MIN_ASSISTANT_WIDTH, Math.min(MAX_ASSISTANT_WIDTH, containerWidth - MIN_DASHBOARD_WIDTH))
      : MAX_ASSISTANT_WIDTH;
  return Math.round(Math.min(max, Math.max(MIN_ASSISTANT_WIDTH, finite)));
}

/** The Assistant is on the right, so dragging the divider left (smaller x) widens it. */
export function widthFromDrag(startWidth: number, startX: number, currentX: number): number {
  return startWidth - (currentX - startX);
}

export function parseWorkspaceState(raw: string | null | undefined): WorkspacePersistedState {
  if (!raw) return { ...DEFAULT_WORKSPACE_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspacePersistedState> | null;
    return {
      width:
        typeof parsed?.width === "number" && Number.isFinite(parsed.width)
          ? clampAssistantWidth(parsed.width)
          : DEFAULT_WORKSPACE_STATE.width,
      collapsed: typeof parsed?.collapsed === "boolean" ? parsed.collapsed : false,
    };
  } catch {
    return { ...DEFAULT_WORKSPACE_STATE };
  }
}

/** Storage can be missing or throw (private mode, blocked site data); fall back to defaults. */
export function getBrowserStorage(): WorkspaceStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadWorkspaceState(
  storage: WorkspaceStorage | null,
  key = DEFAULT_STORAGE_KEY
): WorkspacePersistedState {
  try {
    return parseWorkspaceState(storage?.getItem(key));
  } catch {
    return { ...DEFAULT_WORKSPACE_STATE };
  }
}

export function saveWorkspaceState(
  storage: WorkspaceStorage | null,
  state: WorkspacePersistedState,
  key = DEFAULT_STORAGE_KEY
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
