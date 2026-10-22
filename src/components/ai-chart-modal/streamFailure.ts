import { completeMastraAssistantTurn } from "./completeMastraTurn";
import type { MastraChartMessage, ToolEvent } from "./types";

/** Close every still-running tool event with the given outcome. */
export function settleRunningTools(
  events: ToolEvent[],
  outcome: Pick<ToolEvent, "status"> & Partial<Pick<ToolEvent, "error">>,
): ToolEvent[] {
  return events.map((event) =>
    event.status === "running" ? { ...event, ...outcome, endedAt: Date.now() } : event,
  );
}

/**
 * Show a failed turn: keep the in-progress assistant turn (text/data/viz) and attach a visible
 * error ask, or append a standalone error turn when no assistant turn was started.
 */
export function withStreamFailure(
  messages: MastraChartMessage[],
  assistantMessageId: string | null,
  errorContent: string,
  settledToolEvents: ToolEvent[],
  createId: (prefix: string) => string,
): MastraChartMessage[] {
  const toolEvents = settledToolEvents.length > 0 ? settledToolEvents : undefined;
  const errorBlock = { id: createId("ask-error"), type: "ask" as const, content: errorContent };

  if (assistantMessageId && messages.some((m) => m.id === assistantMessageId)) {
    return messages.map((message) => {
      if (message.id !== assistantMessageId) return message;
      const completed = completeMastraAssistantTurn(
        { ...message, kind: "turn", toolEvents: toolEvents ?? message.toolEvents },
        createId,
      );
      const askAlready =
        completed.blocks?.some(
          (b) => b.type === "ask" && b.content.toLowerCase().includes(errorContent.toLowerCase().slice(0, 24)),
        ) ?? false;
      if (askAlready) return completed;
      return {
        ...completed,
        blocks: [...(completed.blocks ?? []), errorBlock],
        content: completed.content.trim().length > 0 ? completed.content : errorContent,
      };
    });
  }

  return [
    ...messages,
    {
      id: createId("error"),
      role: "assistant",
      kind: "turn",
      content: errorContent,
      blocks: [errorBlock],
      timestamp: new Date(),
      ...(toolEvents ? { toolEvents } : {}),
    },
  ];
}
