import type { MastraChartMessage as Message } from "./types";

const GENERIC_ASSISTANT_SUMMARIES = new Set([
  "I've prepared a visualization for you.",
  "I've prepared a table for you.",
  "I processed your request.",
]);

export function getLatestResultId(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    const resultId = message.resultId ?? message.queryResult?.resultId;
    if (typeof resultId === "string" && resultId.trim().length > 0) {
      return resultId.trim();
    }
  }

  return undefined;
}

const FOLLOW_UP_RESULT_REFERENCE =
  "(?:that|this|it|the above|the previous result|the previous results|the result|the results|same data)";

const FOLLOW_UP_VISUALIZATION_PATTERNS = [
  new RegExp(
    `^(?:can you\\s+|please\\s+)?(?:turn|convert|make|render)\\s+${FOLLOW_UP_RESULT_REFERENCE}\\s+(?:into|as)\\s+(?:a\\s+|an\\s+)?(?:bar|line|pie|column|area)?\\s*(?:chart|graph|table|visuali[sz]ation)\\b`,
    "i"
  ),
  new RegExp(
    `^(?:can you\\s+|please\\s+)?(?:plot|chart|graph|visuali[sz]e|tabulate)\\s+${FOLLOW_UP_RESULT_REFERENCE}\\b`,
    "i"
  ),
  new RegExp(
    `^(?:can you\\s+|please\\s+)?(?:show|display)\\s+${FOLLOW_UP_RESULT_REFERENCE}\\s+(?:as|in)\\s+(?:a\\s+|an\\s+)?(?:bar|line|pie|column|area)?\\s*(?:chart|graph|table|visuali[sz]ation)\\b`,
    "i"
  ),
  /^(?:a\s+|an\s+)?(?:bar|line|pie|column|area)\s+chart$/i,
  /^(?:show\s+as|make\s+it\s+a)\s+(?:bar|line|pie|column|area)\s+chart$/i,
  /^(?:show\s+as|make\s+it)\s+(?:a\s+)?table$/i,
];

export function shouldReuseLatestResultId(prompt: string) {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) return false;
  return FOLLOW_UP_VISUALIZATION_PATTERNS.some((pattern) =>
    pattern.test(normalizedPrompt)
  );
}

export function getMessageRationale(message: Message) {
  const rationale = message.rationale?.trim();
  if (rationale) return rationale;

  const content = message.content.trim();
  if (!content || GENERIC_ASSISTANT_SUMMARIES.has(content)) {
    return undefined;
  }

  return content;
}
