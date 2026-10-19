import type { MastraChartMessage } from "./types";

/** Shapes returned by the Assistant Threads endpoints (`/assistant-threads`). */
export interface AssistantThreadSummary {
  id: string;
  title: string;
  mastra_thread_id: string;
  last_activity_at: string;
  created_at: string;
}

export interface StoredThreadMessage {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  references: {
    chartIds?: string[];
    resultIds?: string[];
    tags?: string[];
    intent?: string;
  };
}

const MAX_TITLE_LENGTH = 60;
export const DEFAULT_THREAD_TITLE = "New thread";

/** Thread title from the first question: single line, truncated. */
export function threadTitleFromQuestion(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  if (!line) return DEFAULT_THREAD_TITLE;
  return line.length > MAX_TITLE_LENGTH ? `${line.slice(0, MAX_TITLE_LENGTH - 1)}…` : line;
}

/**
 * Rebuild chat messages from stored text + references. Only user/assistant turns are kept.
 * `labelFor` resolves a tagged chart id to its current label (null when the chart is gone).
 */
export function threadMessagesToChatMessages(
  stored: ReadonlyArray<StoredThreadMessage>,
  labelFor: (chartId: string) => string | null,
): MastraChartMessage[] {
  const out: MastraChartMessage[] = [];
  for (const message of stored) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const timestamp = new Date(message.createdAt);
    if (message.role === "user") {
      if (!message.text.trim()) continue;
      const tags = message.references.tags ?? [];
      out.push({
        id: message.id,
        role: "user",
        content: message.text,
        timestamp,
        ...(tags.length > 0
          ? { taggedCharts: tags.map((chartId) => ({ chartId, label: labelFor(chartId) ?? "Removed chart" })) }
          : {}),
        ...(message.references.intent ? { intent: message.references.intent } : {}),
      });
      continue;
    }
    if (!message.text.trim()) continue;
    out.push({
      id: message.id,
      role: "assistant",
      kind: "turn",
      content: message.text,
      blocks: [{ id: `${message.id}-text`, type: "text", content: message.text }],
      timestamp,
    });
  }
  return out;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ThreadsClientOptions {
  /** Base URL of the threads endpoint, e.g. `/api/assistant-threads`. */
  baseUrl: string;
  dashboardId: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function createThreadsClient({
  baseUrl,
  dashboardId,
  headers = {},
  fetchImpl = (input, init) => fetch(input, init),
}: ThreadsClientOptions) {
  const root = baseUrl.replace(/\/+$/, "");
  const scope = `dashboardId=${encodeURIComponent(dashboardId)}`;
  const jsonHeaders = { "Content-Type": "application/json", ...headers };

  return {
    async list(): Promise<AssistantThreadSummary[]> {
      const body = await readJson<{ data: AssistantThreadSummary[] }>(
        await fetchImpl(`${root}?${scope}`, { headers }),
      );
      return body.data;
    },
    async create(title?: string): Promise<AssistantThreadSummary> {
      return readJson<AssistantThreadSummary>(
        await fetchImpl(root, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ dashboardId, ...(title ? { title } : {}) }),
        }),
      );
    },
    async rename(threadId: string, title: string): Promise<AssistantThreadSummary> {
      return readJson<AssistantThreadSummary>(
        await fetchImpl(`${root}/${encodeURIComponent(threadId)}?${scope}`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({ title }),
        }),
      );
    },
    async messages(threadId: string): Promise<StoredThreadMessage[]> {
      const body = await readJson<{ data: StoredThreadMessage[] }>(
        await fetchImpl(`${root}/${encodeURIComponent(threadId)}/messages?${scope}`, { headers }),
      );
      return body.data;
    },
  };
}
