import type { UserRole } from "@/types";
import { RagServiceError } from "@/lib/rag/core";

export const MAX_CHAT_MESSAGE_LENGTH = 4_000;
export const MAX_CHAT_REQUEST_BYTES = 16_384;
export const MAX_CHAT_RESPONSE_LENGTH = 24_000;
export const MAX_CONVERSATION_TITLE_LENGTH = 80;
const MAX_CONTEXT_MESSAGES = 20;

export interface ChatSession {
  user?: {
    id?: string | null;
    role?: UserRole | null;
  } | null;
}

export interface ChatMessageRecord {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: Date;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export interface ChatConversation extends ChatConversationSummary {
  messages: ChatMessageRecord[];
}

export interface UserTurn {
  status: "created" | "existing" | "conflict" | "not-found";
  userMessage?: ChatMessageRecord;
  assistantMessage?: ChatMessageRecord | null;
}

export interface ChatRepository {
  listConversations(userId: string): Promise<ChatConversationSummary[]>;
  createConversation(userId: string): Promise<ChatConversationSummary>;
  getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversation | null>;
  renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ChatConversationSummary | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  createUserMessage(
    userId: string,
    conversationId: string,
    content: string,
    requestId: string,
  ): Promise<UserTurn>;
  saveAssistantMessage(
    userId: string,
    conversationId: string,
    content: string,
    requestId: string,
  ): Promise<ChatMessageRecord | null>;
}

export interface ProviderMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatProvider {
  openChatStream(messages: ProviderMessage[]): Promise<AsyncIterable<string>>;
}

export interface UserRateLimiter {
  allow(userId: string): boolean;
}

export interface ChatApiDependencies {
  getSession(): Promise<ChatSession | null>;
  repository: ChatRepository;
  provider: ChatProvider;
  rateLimiter: UserRateLimiter;
  retrieveContext?(
    userId: string,
    role: UserRole | undefined,
    query: string,
  ): Promise<string | null>;
}

export class ChatProviderError extends Error {
  constructor(
    message: string,
    readonly status: 503 | 504 = 503,
  ) {
    super(message);
    this.name = "ChatProviderError";
  }
}

export function createUserRateLimiter(
  limit = 10,
  windowMs = 60_000,
  now: () => number = Date.now,
): UserRateLimiter {
  const requests = new Map<string, number[]>();

  return {
    allow(userId) {
      const cutoff = now() - windowMs;
      const recent = (requests.get(userId) ?? []).filter(
        (timestamp) => timestamp > cutoff,
      );
      if (requests.size > 1_000) {
        for (const [key, timestamps] of requests) {
          if (timestamps.every((timestamp) => timestamp <= cutoff)) {
            requests.delete(key);
          }
        }
      }

      if (recent.length >= limit) {
        requests.set(userId, recent);
        return false;
      }

      recent.push(now());
      requests.set(userId, recent);
      return true;
    },
  };
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function readJsonObject(
  request: Request,
): Promise<
  | { kind: "valid"; value: Record<string, string> }
  | { kind: "invalid" }
  | { kind: "too-large" }
> {
  const declaredLength = request.headers.get("content-length");

  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      return { kind: "invalid" };
    }
    if (parsedLength > MAX_CHAT_REQUEST_BYTES) {
      return { kind: "too-large" };
    }
  }

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { kind: "invalid" };
  }

  if (!request.body) {
    return { kind: "invalid" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.byteLength;
      if (totalBytes > MAX_CHAT_REQUEST_BYTES) {
        await reader.cancel();
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return { kind: "invalid" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed: Record<string, string> = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as Record<string, string>;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return { kind: "invalid" };
    }
    return { kind: "valid", value: parsed };
  } catch {
    return { kind: "invalid" };
  }
}

function hasOnlyKeys(
  value: Record<string, string>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function reportServerFailure(error: Error): void {
  console.error("Chat request failed:", error.name);
}

function streamEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: { type: "delta"; content: string } | { type: "done" } | { type: "error"; message: string },
): void {
  controller.enqueue(
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
  );
}

function eventStream(
  run: (
    controller: ReadableStreamDefaultController<Uint8Array>,
    encoder: TextEncoder,
  ) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await run(controller, encoder);
      } catch (error) {
        reportServerFailure(error instanceof Error ? error : new Error("Unknown failure"));
        streamEvent(controller, encoder, {
          type: "error",
          message: "The response was interrupted. Retry this message to continue.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function guarded(
  handler: (
    request: Request,
    userId: string,
    conversationId?: string,
    role?: UserRole,
  ) => Promise<Response>,
  getSession: ChatApiDependencies["getSession"],
): (request: Request, conversationId?: string) => Promise<Response> {
  return async (request, conversationId) => {
    try {
      const session = await getSession();
      const userId = session?.user?.id;

      if (!userId) {
        return jsonError("Authentication required.", 401);
      }

      return await handler(
        request,
        userId,
        conversationId,
        session?.user?.role ?? undefined,
      );
    } catch (error) {
      reportServerFailure(error instanceof Error ? error : new Error("Unknown failure"));
      return jsonError("The chat service is temporarily unavailable.", 500);
    }
  };
}

export function createChatApi(dependencies: ChatApiDependencies) {
  const {
    getSession,
    provider,
    rateLimiter,
    repository,
    retrieveContext,
  } = dependencies;

  const listConversations = guarded(async (request, userId) => {
    if (new URL(request.url).searchParams.size > 0) {
      return jsonError("Query parameters are not supported.", 400);
    }

    const conversations = await repository.listConversations(userId);
    return Response.json({ conversations });
  }, getSession);

  const createConversation = guarded(async (request, userId) => {
    if (new URL(request.url).searchParams.size > 0) {
      return jsonError("Query parameters are not supported.", 400);
    }
    if (!rateLimiter.allow(userId)) {
      return jsonError("Too many requests. Please wait before trying again.", 429);
    }

    const conversation = await repository.createConversation(userId);
    return Response.json({ conversation }, { status: 201 });
  }, getSession);

  const getConversation = guarded(async (request, userId, conversationId) => {
    if (!conversationId) {
      return jsonError("Conversation ID is required.", 400);
    }
    if (new URL(request.url).searchParams.size > 0) {
      return jsonError("Query parameters are not supported.", 400);
    }

    const conversation = await repository.getConversation(userId, conversationId);
    if (!conversation) {
      return jsonError("Conversation not found.", 404);
    }

    return Response.json({ conversation });
  }, getSession);

  const renameConversation = guarded(async (request, userId, conversationId) => {
    if (!conversationId) {
      return jsonError("Conversation ID is required.", 400);
    }
    if (new URL(request.url).searchParams.size > 0) {
      return jsonError("Query parameters are not supported.", 400);
    }
    const body = await readJsonObject(request);
    if (body.kind === "too-large") {
      return jsonError("Request body is too large.", 413);
    }
    if (
      body.kind !== "valid" ||
      !hasOnlyKeys(body.value, ["title"]) ||
      typeof body.value.title !== "string" ||
      body.value.title.trim().length === 0 ||
      body.value.title.trim().length > MAX_CONVERSATION_TITLE_LENGTH
    ) {
      return jsonError("A valid conversation title is required.", 400);
    }

    const conversation = await repository.renameConversation(
      userId,
      conversationId,
      body.value.title.trim(),
    );
    if (!conversation) {
      return jsonError("Conversation not found.", 404);
    }

    return Response.json({ conversation });
  }, getSession);

  const deleteConversation = guarded(async (request, userId, conversationId) => {
    if (!conversationId) {
      return jsonError("Conversation ID is required.", 400);
    }
    if (new URL(request.url).searchParams.size > 0) {
      return jsonError("Query parameters are not supported.", 400);
    }
    const deleted = await repository.deleteConversation(userId, conversationId);
    if (!deleted) {
      return jsonError("Conversation not found.", 404);
    }

    return new Response(null, { status: 204 });
  }, getSession);

  const activeRequests = new Set<string>();
  const sendMessage = guarded(async (request, userId, conversationId, role) => {
    if (!conversationId) {
      return jsonError("Conversation ID is required.", 400);
    }
    if (new URL(request.url).searchParams.size > 0) {
      return jsonError("Query parameters are not supported.", 400);
    }

    const body = await readJsonObject(request);
    if (body.kind === "too-large") {
      return jsonError("Request body is too large.", 413);
    }
    if (
      body.kind !== "valid" ||
      !hasOnlyKeys(body.value, ["message", "requestId"]) ||
      typeof body.value.message !== "string" ||
      typeof body.value.requestId !== "string"
    ) {
      return jsonError("A valid message and request ID are required.", 400);
    }

    const content = body.value.message.trim();
    const requestId = body.value.requestId;

    if (content.length === 0 || content.length > MAX_CHAT_MESSAGE_LENGTH) {
      return jsonError(
        `Messages must contain 1 to ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
        400,
      );
    }
    if (!isUuid(requestId)) {
      return jsonError("A valid request ID is required.", 400);
    }
    if (!rateLimiter.allow(userId)) {
      return jsonError("Too many messages. Please wait before trying again.", 429);
    }

    const requestKey = `${userId}:${conversationId}:${requestId}`;
    if (activeRequests.has(requestKey)) {
      return jsonError("This message is already being processed.", 409);
    }
    activeRequests.add(requestKey);

    let streaming = false;
    try {
      const userTurn = await repository.createUserMessage(
        userId,
        conversationId,
        content,
        requestId,
      );

      if (userTurn.status === "not-found") {
        return jsonError("Conversation not found.", 404);
      }
      if (userTurn.status === "conflict" || !userTurn.userMessage) {
        return jsonError("This request ID was already used for another message.", 409);
      }

      let providerStream: AsyncIterable<string> | null = null;
      if (!userTurn.assistantMessage) {
        const conversation = await repository.getConversation(userId, conversationId);
        if (!conversation) {
          return jsonError("Conversation not found.", 404);
        }
        const context: ProviderMessage[] = conversation.messages
          .slice(-MAX_CONTEXT_MESSAGES)
          .map((message) => ({
            role: message.role === "USER" ? "user" as const : "assistant" as const,
            content: message.content,
          }));

        if (retrieveContext) {
          try {
            const documentContext = await retrieveContext(userId, role, content);
            if (documentContext) {
              context.unshift({ role: "system", content: documentContext });
            }
          } catch (error) {
            if (error instanceof RagServiceError) {
              return jsonError(error.message, error.status);
            }
            throw error;
          }
        }

        try {
          providerStream = await provider.openChatStream(context);
        } catch (error) {
          if (error instanceof ChatProviderError) {
            return jsonError(error.message, error.status);
          }
          return jsonError("The local AI service is unavailable.", 503);
        }
      }

      streaming = true;
      return eventStream(async (controller, encoder) => {
        try {
          let responseText = "";

          if (userTurn.assistantMessage) {
            responseText = userTurn.assistantMessage.content;
            if (responseText) {
              streamEvent(controller, encoder, {
                type: "delta",
                content: responseText,
              });
            }
          } else if (providerStream) {
            for await (const chunk of providerStream) {
              if (!chunk) {
                continue;
              }
              if (responseText.length + chunk.length > MAX_CHAT_RESPONSE_LENGTH) {
                throw new ChatProviderError("The response exceeded the allowed length.");
              }
              responseText += chunk;
              streamEvent(controller, encoder, { type: "delta", content: chunk });
            }

            if (responseText.trim().length === 0) {
              throw new ChatProviderError("The local AI service returned an empty response.");
            }

            const saved = await repository.saveAssistantMessage(
              userId,
              conversationId,
              responseText,
              requestId,
            );
            if (!saved) {
              throw new Error("Conversation ownership changed during response generation.");
            }
          }

          streamEvent(controller, encoder, { type: "done" });
        } finally {
          activeRequests.delete(requestKey);
        }
      });
    } finally {
      if (!streaming) {
        activeRequests.delete(requestKey);
      }
    }
  }, getSession);

  return {
    listConversations,
    createConversation,
    getConversation: (request: Request, conversationId: string) =>
      getConversation(request, conversationId),
    renameConversation: (request: Request, conversationId: string) =>
      renameConversation(request, conversationId),
    deleteConversation: (request: Request, conversationId: string) =>
      deleteConversation(request, conversationId),
    sendMessage: (request: Request, conversationId: string) =>
      sendMessage(request, conversationId),
  };
}
