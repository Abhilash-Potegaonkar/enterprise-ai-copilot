import {
  ChatProviderError,
  type ChatProvider,
  type ProviderMessage,
} from "./api";

interface OllamaChatChunk {
  done?: boolean;
  error?: string;
  message?: {
    content?: string;
  };
}

function parseChunk(line: string): OllamaChatChunk {
  try {
    const chunk: OllamaChatChunk = JSON.parse(line) as OllamaChatChunk;
    if (typeof chunk !== "object" || chunk === null || Array.isArray(chunk)) {
      throw new ChatProviderError("The local AI service returned an invalid response.");
    }
    return chunk;
  } catch (error) {
    if (error instanceof ChatProviderError) {
      throw error;
    }
    throw new ChatProviderError("The local AI service returned an invalid response.");
  }
}

function getLocalEndpoint(): string {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new ChatProviderError("The local AI service is not configured.");
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (
    !isLoopback ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new ChatProviderError("The local AI service must use a loopback URL.");
  }

  return `${url.toString().replace(/\/+$/, "")}/api/chat`;
}

export function createOllamaProvider(
  fetcher: typeof fetch = fetch,
): ChatProvider {
  return {
    async openChatStream(messages: ProviderMessage[]) {
      const endpoint = getLocalEndpoint();
      const model = process.env.OLLAMA_MODEL ?? "llama3.2:1b";
      if (/(?:^|[-:])cloud(?:$|[-:])/i.test(model)) {
        throw new ChatProviderError("Only locally installed Ollama models are supported.");
      }
      let response: Response;

      try {
        response = await fetcher(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content: "You are a helpful assistant. Do not claim access to company systems or data.",
              },
              ...messages,
            ],
            stream: true,
          }),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new ChatProviderError("The local AI service timed out.", 504);
        }
        throw new ChatProviderError("The local AI service is unavailable.", 503);
      }

      if (!response.ok) {
        throw new ChatProviderError(
          "The local AI service is unavailable or the configured model is missing.",
          response.status === 408 || response.status === 504 ? 504 : 503,
        );
      }
      if (!response.body) {
        throw new ChatProviderError("The local AI service returned no response.", 503);
      }

      const body = response.body;
      const stream: AsyncIterable<string> = {
        async *[Symbol.asyncIterator]() {
          const reader = body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          let finished = false;

          async function* parseLines(
            lines: string[],
          ): AsyncIterable<string> {
            for (const line of lines) {
              if (!line.trim()) {
                continue;
              }
              const chunk = parseChunk(line);
              if (typeof chunk.error === "string") {
                throw new ChatProviderError(
                  "The local AI service could not load the configured model.",
                );
              }
              if (typeof chunk.message?.content === "string") {
                yield chunk.message.content;
              }
              if (chunk.done === true) {
                finished = true;
              }
            }
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                pending += decoder.decode();
                if (pending.trim()) {
                  yield* parseLines([pending]);
                }
                if (!finished) {
                  throw new ChatProviderError(
                    "The local AI service ended the response unexpectedly.",
                  );
                }
                return;
              }

              pending += decoder.decode(value, { stream: true });
              const lines = pending.split("\n");
              pending = lines.pop() ?? "";
              yield* parseLines(lines);
              if (finished) {
                await reader.cancel();
                return;
              }
            }
          } catch (error) {
            if (error instanceof ChatProviderError) {
              throw error;
            }
            if (error instanceof Error && error.name === "TimeoutError") {
              throw new ChatProviderError("The local AI service timed out.", 504);
            }
            throw new ChatProviderError("The local AI service stream was interrupted.");
          } finally {
            reader.releaseLock();
          }
        },
      };

      return stream;
    },
  };
}
