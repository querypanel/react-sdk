import type { TagIntent } from "../workspaceState";

/** Response of the tag-intent endpoint. `ask` means the user picks from `options`. */
export interface TagIntentDecision {
  intent: TagIntent | "ask";
  source: "jev" | "luna" | "ask";
  confidence: number | null;
  options?: TagIntent[];
  /** 2+ tags with an edit request: the Assistant asks the user to pick one chart. */
  needsSingleChart?: boolean;
}

export const NEEDS_SINGLE_CHART_MESSAGE =
  "To change a chart, tag just one chart and ask again. With several tags I can only answer questions about them.";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Ask the API which intent a tagged message has. Any failure becomes an `ask` (the user decides). */
export async function fetchTagIntent(
  url: string,
  headers: Record<string, string>,
  input: {
    question: string;
    tagged: Array<{ title: string; sql: string; kind: string | null }>;
  },
  fetchImpl: FetchLike = (u, init) => fetch(u, init),
): Promise<TagIntentDecision> {
  const fallback: TagIntentDecision = {
    intent: "ask",
    source: "ask",
    confidence: null,
    options: input.tagged.length === 1 ? ["investigate", "modify", "replace"] : ["investigate"],
  };
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(input),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as Partial<TagIntentDecision>;
    if (body.intent !== "ask" && body.intent !== "investigate" && body.intent !== "modify" && body.intent !== "replace") {
      return fallback;
    }
    return { ...fallback, ...body } as TagIntentDecision;
  } catch {
    return fallback;
  }
}
