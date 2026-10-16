export interface ChatStreamEvent {
  type: "delta" | "done" | "error";
  content?: string;
  message?: string;
}

function parseEvent(
  source: string,
  onDelta: (content: string) => void,
): boolean {
  const data = source
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) {
    return false;
  }

  let event: ChatStreamEvent;
  try {
    event = JSON.parse(data) as ChatStreamEvent;
  } catch {
    throw new Error("The server sent an invalid chat response.");
  }

  if (event.type === "delta" && typeof event.content === "string") {
    onDelta(event.content);
    return false;
  }
  if (event.type === "done") {
    return true;
  }
  if (event.type === "error" && typeof event.message === "string") {
    throw new Error(event.message);
  }
  throw new Error("The server sent an invalid chat response.");
}

export async function consumeChatEventStream(
  response: Response,
  onDelta: (content: string) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("The chat response did not contain a stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) {
          completed = parseEvent(buffer, onDelta) || completed;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        completed = parseEvent(event, onDelta) || completed;
      }
      if (completed) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!completed) {
    throw new Error("The response ended before the assistant finished.");
  }
}
