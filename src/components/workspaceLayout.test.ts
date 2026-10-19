import { describe, expect, it } from "vitest";
import {
  clampAssistantWidth,
  DEFAULT_ASSISTANT_WIDTH,
  DRAWER_BREAKPOINT,
  loadWorkspaceState,
  MAX_ASSISTANT_WIDTH,
  MIN_ASSISTANT_WIDTH,
  MIN_DASHBOARD_WIDTH,
  parseWorkspaceState,
  resolveLayoutMode,
  saveWorkspaceState,
  widthFromDrag,
  type WorkspaceStorage,
} from "./workspaceLayout";

function memoryStorage(initial: Record<string, string> = {}): WorkspaceStorage {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwingStorage: WorkspaceStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
};

describe("resolveLayoutMode", () => {
  it("uses a drawer below the breakpoint and split at or above it", () => {
    expect(resolveLayoutMode(DRAWER_BREAKPOINT - 1)).toBe("drawer");
    expect(resolveLayoutMode(DRAWER_BREAKPOINT)).toBe("split");
  });

  it("treats an unmeasured container as split", () => {
    expect(resolveLayoutMode(0)).toBe("split");
  });
});

describe("clampAssistantWidth", () => {
  it("clamps to the min and max", () => {
    expect(clampAssistantWidth(10)).toBe(MIN_ASSISTANT_WIDTH);
    expect(clampAssistantWidth(5000)).toBe(MAX_ASSISTANT_WIDTH);
  });

  it("leaves the Dashboard its minimum width", () => {
    expect(clampAssistantWidth(600, 900)).toBe(900 - MIN_DASHBOARD_WIDTH);
  });

  it("never drops below the min even in a tiny container", () => {
    expect(clampAssistantWidth(400, 500)).toBe(MIN_ASSISTANT_WIDTH);
  });

  it("falls back to the default for NaN", () => {
    expect(clampAssistantWidth(Number.NaN)).toBe(DEFAULT_ASSISTANT_WIDTH);
  });
});

describe("widthFromDrag", () => {
  it("widens the Assistant when dragging left", () => {
    expect(widthFromDrag(400, 500, 450)).toBe(450);
  });

  it("narrows the Assistant when dragging right", () => {
    expect(widthFromDrag(400, 500, 540)).toBe(360);
  });
});

describe("parseWorkspaceState", () => {
  it("returns defaults for missing or invalid input", () => {
    const defaults = { width: DEFAULT_ASSISTANT_WIDTH, collapsed: false };
    expect(parseWorkspaceState(null)).toEqual(defaults);
    expect(parseWorkspaceState("not json")).toEqual(defaults);
    expect(parseWorkspaceState("null")).toEqual(defaults);
    expect(parseWorkspaceState('{"width":"wide","collapsed":"yes"}')).toEqual(defaults);
  });

  it("clamps a stored width and keeps a stored collapsed flag", () => {
    expect(parseWorkspaceState('{"width":9999,"collapsed":true}')).toEqual({
      width: MAX_ASSISTANT_WIDTH,
      collapsed: true,
    });
  });
});

describe("workspace state storage", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    expect(saveWorkspaceState(storage, { width: 500, collapsed: true })).toBe(true);
    expect(loadWorkspaceState(storage)).toEqual({ width: 500, collapsed: true });
  });

  it("respects a custom key", () => {
    const storage = memoryStorage();
    saveWorkspaceState(storage, { width: 500, collapsed: true }, "custom");
    expect(loadWorkspaceState(storage)).toEqual({ width: DEFAULT_ASSISTANT_WIDTH, collapsed: false });
    expect(loadWorkspaceState(storage, "custom").width).toBe(500);
  });

  it("falls back when storage is unavailable or throws", () => {
    const defaults = { width: DEFAULT_ASSISTANT_WIDTH, collapsed: false };
    expect(loadWorkspaceState(null)).toEqual(defaults);
    expect(loadWorkspaceState(throwingStorage)).toEqual(defaults);
    expect(saveWorkspaceState(null, defaults)).toBe(false);
    expect(saveWorkspaceState(throwingStorage, defaults)).toBe(false);
  });
});
