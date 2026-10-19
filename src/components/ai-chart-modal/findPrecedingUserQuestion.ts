type MessageLike = {
  id: string;
  role: string;
  content: string;
};

/** Walk chat history backward from an assistant turn to the nearest user question. */
export function findPrecedingUserQuestion(
  messages: MessageLike[],
  assistantMessage: MessageLike
): string | undefined {
  const index = messages.findIndex((m) => m.id === assistantMessage.id);
  if (index <= 0) return undefined;
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    if (candidate?.role === "user" && candidate.content.trim()) {
      return candidate.content.trim();
    }
  }
  return undefined;
}
