import { describe, expect, it } from "vitest";
import {
  createThreadsClient,
  hydrateThreadCharts,
  DEFAULT_THREAD_TITLE,
  threadMessagesToChatMessages,
  threadTitleFromQuestion,
  type StoredThreadMessage,
} from "./assistantThreads";

const stored = (over: Partial<StoredThreadMessage>): StoredThreadMessage => ({
  id: "m",
  role: "user",
  text: "hello",
  createdAt: "2026-10-19T10:00:00.000Z",
  references: {},
  ...over,
});

describe("threadTitleFromQuestion", () => {
  it("collapses whitespace and truncates", () => {
    expect(threadTitleFromQuestion("  a\n b  ")).toBe("a b");
    expect(threadTitleFromQuestion("x".repeat(100))).toHaveLength(60);
    expect(threadTitleFromQuestion("   ")).toBe(DEFAULT_THREAD_TITLE);
  });
});

describe("threadMessagesToChatMessages", () => {
  it("rebuilds user and assistant turns and skips other roles and empty text", () => {
    const messages = threadMessagesToChatMessages(
      [
        stored({ id: "u", role: "user", text: "Why the dip?" }),
        stored({ id: "a", role: "assistant", text: "Because of **churn**." }),
        stored({ id: "t", role: "tool", text: "x" }),
        stored({ id: "e", role: "assistant", text: "  " }),
      ],
    );
    expect(messages.map((m) => m.id)).toEqual(["u", "a"]);
    expect(messages[1]).toMatchObject({ kind: "turn", blocks: [{ type: "text", content: "Because of **churn**." }] });
  });

  it("restores tags (labelled Removed chart) and intent on user messages", () => {
    const [message] = threadMessagesToChatMessages(
      [stored({ references: { tags: ["c1", "gone"], intent: "investigate" } })],
    );
    expect(message).toMatchObject({
      taggedCharts: [
        { chartId: "c1", label: "Removed chart" },
        { chartId: "gone", label: "Removed chart" },
      ],
      intent: "investigate",
    });
  });
});

describe("chart previews in history", () => {
  const chart = { resultId: "r1", datasourceId: "ds", sql: "select 1", params: null, rationale: null, spec: { kind: "chart" } };

  it("turns stored chart refs into viz blocks, even without text", () => {
    const [message] = threadMessagesToChatMessages(
      [stored({ role: "assistant", text: "", charts: [chart] })],
    );
    expect(message!.blocks).toEqual([
      expect.objectContaining({ type: "viz", chartSpec: { kind: "chart" }, sql: "select 1", datasourceId: "ds", resultId: "r1" }),
    ]);
  });

  it("keeps two charts of one result apart and remembers the latest result for follow-ups", () => {
    const [message] = threadMessagesToChatMessages(
      [stored({ role: "assistant", text: "", charts: [chart, { ...chart, spec: { kind: "table" } }, { ...chart, resultId: "r2" }] })],
    );
    const ids = message!.blocks?.map((block) => block.id) ?? [];
    expect(new Set(ids).size).toBe(3);
    expect(message!.resultId).toBe("r2");
  });

  it("carries the json-render spec so restored charts insert like live ones", () => {
    const jsonRenderSpec = { root: "p", elements: {} };
    const [message] = threadMessagesToChatMessages(
      [stored({ role: "assistant", text: "", charts: [{ ...chart, jsonRenderSpec }] })],
    );
    expect(message!.blocks?.[0]).toMatchObject({ type: "viz", jsonRenderSpec });
  });

  it("puts the summary after the charts for 2+ charts, before for one", () => {
    const [many] = threadMessagesToChatMessages(
      [stored({ role: "assistant", text: "Summary", charts: [chart, { ...chart, resultId: "r2" }] })],
    );
    expect(many!.blocks!.map((b) => b.type)).toEqual(["viz", "viz", "text"]);
    const [one] = threadMessagesToChatMessages(
      [stored({ role: "assistant", text: "Summary", charts: [chart] })],
    );
    expect(one!.blocks!.map((b) => b.type)).toEqual(["text", "viz"]);
  });

  it("hydrates rows by re-running SQL and drops charts that fail", async () => {
    const messages = threadMessagesToChatMessages(
      [
        stored({ id: "ok", role: "assistant", text: "a", charts: [chart] }),
        stored({ id: "bad", role: "assistant", text: "b", charts: [{ ...chart, resultId: "r2" }] }),
      ],
    );
    const hydrated = await hydrateThreadCharts(messages, async (block) => {
      if (block.resultId === "r2") throw new Error("expired");
      return { fields: ["x"], rows: [{ x: 1 }], rowCount: 1 };
    });
    const vizOf = (i: number) => hydrated[i]!.blocks!.filter((b) => b.type === "viz");
    expect(vizOf(0)).toEqual([expect.objectContaining({ queryResult: { fields: ["x"], rows: [{ x: 1 }], rowCount: 1 } })]);
    expect(vizOf(1)).toEqual([]);
    expect(hydrated[1]!.blocks).toHaveLength(1);
  });
});

describe("createThreadsClient", () => {
  it("scopes calls to the Dashboard and forwards headers", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createThreadsClient({
      baseUrl: "/api/assistant-threads/",
      dashboardId: "d 1",
      headers: { "x-organization-id": "org" },
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      },
    });
    await client.list();
    await client.messages("t/1");
    expect(calls[0]!.url).toBe("/api/assistant-threads?dashboardId=d%201");
    expect(calls[1]!.url).toBe("/api/assistant-threads/t%2F1/messages?dashboardId=d%201");
    expect(calls[0]!.init?.headers).toEqual({ "x-organization-id": "org" });
  });

  it("surfaces the API error message", async () => {
    const client = createThreadsClient({
      baseUrl: "/t",
      dashboardId: "d",
      fetchImpl: async () => new Response(JSON.stringify({ error: "Thread not found" }), { status: 404 }),
    });
    await expect(client.messages("x")).rejects.toThrow("Thread not found");
  });
});
