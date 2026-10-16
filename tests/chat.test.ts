import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ChatProviderError,
  createChatApi,
  createUserRateLimiter,
  type ChatConversation,
  type ChatMessageRecord,
  type ChatProvider,
  type ChatRepository,
  type ChatSession,
  type ChatConversationSummary,
} from "@/lib/chat/api";
import { createOllamaProvider } from "@/lib/chat/ollama-provider";
import { consumeChatEventStream } from "@/lib/chat/streaming";

const requestId = "1f4d7a11-87e4-4b7f-9c80-6f1f3d40844a";

interface MemoryMessage extends ChatMessageRecord {
  requestId?: string;
}

interface MemoryConversation extends ChatConversation {
  ownerId: string;
  messages: MemoryMessage[];
}

class MemoryChatRepository implements ChatRepository {
  readonly conversations = new Map<string, MemoryConversation>();
  private nextId = 0;

  async listConversations(userId: string): Promise<ChatConversationSummary[]> {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.ownerId === userId)
      .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  }

  async createConversation(userId: string): Promise<ChatConversationSummary> {
    this.nextId += 1;
    const conversation: MemoryConversation = {
      id: `conversation-${this.nextId}`,
      ownerId: userId,
      title: "New conversation",
      updatedAt: new Date(),
      messages: [],
    };
    this.conversations.set(conversation.id, conversation);
    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ChatConversation | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.ownerId !== userId) {
      return null;
    }
    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
      messages: [...conversation.messages],
    };
  }

  async renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ChatConversationSummary | null> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.ownerId !== userId) {
      return null;
    }
    conversation.title = title;
    conversation.updatedAt = new Date();
    return {
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    };
  }

  async deleteConversation(userId: string, conversationId: string): Promise<boolean> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.ownerId !== userId) {
      return false;
    }
    return this.conversations.delete(conversationId);
  }

  async createUserMessage(
    userId: string,
    conversationId: string,
    content: string,
    id: string,
  ) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation || conversation.ownerId !== userId) {
      return { status: "not-found" as const };
    }

    const existing = conversation.messages.find(
      (message) => message.role === "USER" && message.requestId === id,
    );
    if (existing && existing.content !== content) {
      return { status: "conflict" as const };
    }
    if (existing) {
      return {
        status: "existing" as const,
        userMessage: existing,
        assistantMessage:
          conversation.messages.find(
            (message) => message.role === "ASSISTANT" && message.requestId === id,
          ) ?? null,
      };
    }

    const userMessage: MemoryMessage = {
      id: `message-${conversation.messages.length + 1}`,
      role: "USER",
      content,
      createdAt: new Date(),
      requestId: id,
    };
    conversation.messages.push(userMessage);
    conversation.title =
      conversation.title === "New conversation"
        ? content.slice(0, 80)
        : conversation.title;
    conversation.updatedAt = new Date();
    return {
      status: "created" as const,
      userMessage,
      assistantMessage: null,
    };
  }

  async saveAssistantMessage(
    userId: string,
    conversationId: string,
    content: string,
    id: string,
  ): Promise<ChatMessageRecord | null> {
    const conversation = this.conversations.get(conversationId);
    if (
      !conversation ||
      conversation.ownerId !== userId ||
      !conversation.messages.some(
        (message) => message.role === "USER" && message.requestId === id,
      )
    ) {
      return null;
    }

    const existing = conversation.messages.find(
      (message) => message.role === "ASSISTANT" && message.requestId === id,
    );
    if (existing) {
      return existing;
    }

    const assistantMessage: MemoryMessage = {
      id: `message-${conversation.messages.length + 1}`,
      role: "ASSISTANT",
      content,
      createdAt: new Date(),
      requestId: id,
    };
    conversation.messages.push(assistantMessage);
    return assistantMessage;
  }
}

function createFixture(
  options: {
    userId?: string | null;
    provider?: ChatProvider;
  } = {},
) {
  const repository = new MemoryChatRepository();
  let userId = options.userId === undefined ? "user-a" : options.userId;
  const providerCalls: string[][] = [];
  const provider =
    options.provider ??
    ({
      async openChatStream(messages) {
        providerCalls.push(messages.map((message) => message.content));
        return (async function* () {
          yield "A mocked ";
          yield "answer.";
        })();
      },
    } satisfies ChatProvider);
  const api = createChatApi({
    async getSession(): Promise<ChatSession | null> {
      return userId ? { user: { id: userId } } : null;
    },
    repository,
    provider,
    rateLimiter: createUserRateLimiter(),
  });

  return {
    api,
    repository,
    providerCalls,
    setUserId(value: string | null) {
      userId = value;
    },
  };
}

function makeJsonRequest(
  url: string,
  method: string,
  body: string,
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("secure chat API", () => {
  it("rejects unauthenticated chat operations", async () => {
    const fixture = createFixture({ userId: null });
    const response = await fixture.api.listConversations(
      new Request("http://localhost/api/chat/conversations"),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Authentication required." });
  });

  it("rejects malformed, empty, and oversized messages", async () => {
    const fixture = createFixture();
    const conversation = await fixture.api.createConversation(
      new Request("http://localhost/api/chat/conversations", { method: "POST" }),
    );
    const created: { conversation: ChatConversationSummary } =
      (await conversation.json()) as { conversation: ChatConversationSummary };
    const endpoint = `http://localhost/api/chat/conversations/${created.conversation.id}/messages`;

    assert.equal(
      (
        await fixture.api.sendMessage(
          makeJsonRequest(endpoint, "POST", "{"),
          created.conversation.id,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await fixture.api.sendMessage(
          makeJsonRequest(
            endpoint,
            "POST",
            JSON.stringify({ message: "   ", requestId }),
          ),
          created.conversation.id,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await fixture.api.sendMessage(
          makeJsonRequest(
            endpoint,
            "POST",
            JSON.stringify({ message: "a".repeat(17_000), requestId }),
          ),
          created.conversation.id,
        )
      ).status,
      413,
    );
  });

  it("streams a valid authenticated response and persists both messages", async () => {
    const fixture = createFixture();
    const created = await fixture.api.createConversation(
      new Request("http://localhost/api/chat/conversations", { method: "POST" }),
    );
    const { conversation } = (await created.json()) as {
      conversation: ChatConversationSummary;
    };
    const response = await fixture.api.sendMessage(
      makeJsonRequest(
        `http://localhost/api/chat/conversations/${conversation.id}/messages`,
        "POST",
        JSON.stringify({ message: "Give me a short greeting.", requestId }),
      ),
      conversation.id,
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const stream = await response.text();
    assert.match(stream, /"content":"A mocked "/);
    assert.match(stream, /"type":"done"/);
    assert.deepEqual(fixture.providerCalls, [["Give me a short greeting."]]);
    const stored = await fixture.repository.getConversation("user-a", conversation.id);
    assert.deepEqual(
      stored?.messages.map((message) => [message.role, message.content]),
      [
        ["USER", "Give me a short greeting."],
        ["ASSISTANT", "A mocked answer."],
      ],
    );
  });

  it("scopes conversation reads, updates, deletes, and sends to the owner", async () => {
    const fixture = createFixture();
    const first = await fixture.api.createConversation(
      new Request("http://localhost/api/chat/conversations", { method: "POST" }),
    );
    const firstResult = (await first.json()) as {
      conversation: ChatConversationSummary;
    };
    fixture.setUserId("user-b");
    const second = await fixture.api.createConversation(
      new Request("http://localhost/api/chat/conversations", { method: "POST" }),
    );
    const secondResult = (await second.json()) as {
      conversation: ChatConversationSummary;
    };
    fixture.setUserId("user-a");

    assert.equal(
      (
        await fixture.api.getConversation(
          new Request("http://localhost/api/chat/conversations"),
          secondResult.conversation.id,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fixture.api.renameConversation(
          makeJsonRequest(
            "http://localhost/api/chat/conversations",
            "PATCH",
            JSON.stringify({ title: "stolen" }),
          ),
          secondResult.conversation.id,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fixture.api.deleteConversation(
          new Request("http://localhost/api/chat/conversations", { method: "DELETE" }),
          secondResult.conversation.id,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await fixture.api.sendMessage(
          makeJsonRequest(
            "http://localhost/api/chat/conversations",
            "POST",
            JSON.stringify({ message: "hello", requestId }),
          ),
          secondResult.conversation.id,
        )
      ).status,
      404,
    );

    fixture.setUserId("user-b");
    assert.equal(
      (
        await fixture.api.getConversation(
          new Request("http://localhost/api/chat/conversations"),
          secondResult.conversation.id,
        )
      ).status,
      200,
    );
    assert.equal(
      await fixture.repository.getConversation("user-a", firstResult.conversation.id) !== null,
      true,
    );
  });

  it("rejects client-supplied user IDs and never assigns them ownership", async () => {
    const fixture = createFixture();
    const created = await fixture.api.createConversation(
      makeJsonRequest(
        "http://localhost/api/chat/conversations",
        "POST",
        JSON.stringify({ userId: "user-b" }),
      ),
    );
    const { conversation } = (await created.json()) as {
      conversation: ChatConversationSummary;
    };
    const response = await fixture.api.sendMessage(
      makeJsonRequest(
        `http://localhost/api/chat/conversations/${conversation.id}/messages`,
        "POST",
        JSON.stringify({ message: "hello", requestId, userId: "user-b" }),
      ),
      conversation.id,
    );

    assert.equal(response.status, 400);
    assert.ok(await fixture.repository.getConversation("user-a", conversation.id));
    assert.equal(await fixture.repository.getConversation("user-b", conversation.id), null);
  });

  it("makes duplicate request IDs idempotent and supports retry after provider failure", async () => {
    let fail = true;
    let calls = 0;
    const provider: ChatProvider = {
      async openChatStream() {
        calls += 1;
        if (fail) {
          throw new ChatProviderError("The local AI service is unavailable.", 503);
        }
        return (async function* () {
          yield "Recovered.";
        })();
      },
    };
    const fixture = createFixture({ provider });
    const created = await fixture.api.createConversation(
      new Request("http://localhost/api/chat/conversations", { method: "POST" }),
    );
    const { conversation } = (await created.json()) as {
      conversation: ChatConversationSummary;
    };
    const endpoint = `http://localhost/api/chat/conversations/${conversation.id}/messages`;
    const retryableRequest = () =>
      makeJsonRequest(
        endpoint,
        "POST",
        JSON.stringify({ message: "retry me", requestId }),
      );

    const failed = await fixture.api.sendMessage(
      retryableRequest(),
      conversation.id,
    );
    assert.equal(failed.status, 503);
    fail = false;
    const retried = await fixture.api.sendMessage(
      retryableRequest(),
      conversation.id,
    );
    assert.equal(retried.status, 200);
    await retried.text();
    const replay = await fixture.api.sendMessage(
      retryableRequest(),
      conversation.id,
    );
    assert.equal(replay.status, 200);
    assert.match(await replay.text(), /"content":"Recovered\."/);
    assert.equal(calls, 2);
    assert.equal(
      (await fixture.repository.getConversation("user-a", conversation.id))?.messages.length,
      2,
    );
  });

  it("blocks concurrent duplicate requests while a response is streaming", async () => {
    let releaseStream: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const provider: ChatProvider = {
      async openChatStream() {
        return (async function* () {
          await gate;
          yield "One answer.";
        })();
      },
    };
    const fixture = createFixture({ provider });
    const created = await fixture.api.createConversation(
      new Request("http://localhost/api/chat/conversations", { method: "POST" }),
    );
    const { conversation } = (await created.json()) as {
      conversation: ChatConversationSummary;
    };
    const endpoint = `http://localhost/api/chat/conversations/${conversation.id}/messages`;
    const send = () =>
      fixture.api.sendMessage(
        makeJsonRequest(
          endpoint,
          "POST",
          JSON.stringify({ message: "once", requestId }),
        ),
        conversation.id,
      );

    const firstResponse = await send();
    const concurrentResponse = await send();
    assert.equal(concurrentResponse.status, 409);
    releaseStream();
    assert.match(await firstResponse.text(), /"type":"done"/);
    assert.equal(
      (await fixture.repository.getConversation("user-a", conversation.id))?.messages.length,
      2,
    );
  });

  it("enforces the per-user rate limit", async () => {
    let now = 100;
    const limiter = createUserRateLimiter(2, 60_000, () => now);

    assert.equal(limiter.allow("user-a"), true);
    assert.equal(limiter.allow("user-a"), true);
    assert.equal(limiter.allow("user-a"), false);
    now += 60_001;
    assert.equal(limiter.allow("user-a"), true);
    assert.equal(limiter.allow("user-b"), true);
  });
});

describe("Ollama provider and chat stream decoder", () => {
  it("handles a missing local Ollama service without exposing diagnostics", async () => {
    const previousBaseUrl = process.env.OLLAMA_BASE_URL;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    try {
      const provider = createOllamaProvider(async () => {
        throw new TypeError("connection refused with internal details");
      });

      await assert.rejects(
        provider.openChatStream([{ role: "user", content: "hello" }]),
        (error: Error) =>
          error instanceof ChatProviderError &&
          error.status === 503 &&
          !error.message.includes("internal details"),
      );
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = previousBaseUrl;
      }
    }
  });

  it("refuses remote Ollama hosts and cloud model tags", async () => {
    const previousBaseUrl = process.env.OLLAMA_BASE_URL;
    const previousModel = process.env.OLLAMA_MODEL;
    let fetchCalls = 0;
    const provider = createOllamaProvider(async () => {
      fetchCalls += 1;
      return Response.json({});
    });

    try {
      process.env.OLLAMA_BASE_URL = "https://provider.example";
      await assert.rejects(
        provider.openChatStream([{ role: "user", content: "hello" }]),
        /loopback URL/,
      );

      process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
      process.env.OLLAMA_MODEL = "gemma4:cloud";
      await assert.rejects(
        provider.openChatStream([{ role: "user", content: "hello" }]),
        /locally installed/,
      );
      assert.equal(fetchCalls, 0);
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = previousBaseUrl;
      }
      if (previousModel === undefined) {
        delete process.env.OLLAMA_MODEL;
      } else {
        process.env.OLLAMA_MODEL = previousModel;
      }
    }
  });

  it("parses streamed Ollama NDJSON tokens through the provider abstraction", async () => {
    const previousBaseUrl = process.env.OLLAMA_BASE_URL;
    const previousModel = process.env.OLLAMA_MODEL;
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    process.env.OLLAMA_MODEL = "llama3.2:3b";
    let sentBody = "";
    try {
      const provider = createOllamaProvider(async (input, init) => {
        assert.equal(input, "http://localhost:11434/api/chat");
        sentBody = typeof init?.body === "string" ? init.body : "";
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  '{"message":{"content":"Hello"},"done":false}\n{"message":{"content":"!"},"done":true}\n',
                ),
              );
              controller.close();
            },
          }),
          { status: 200 },
        );
      });
      const stream = await provider.openChatStream([
        { role: "user", content: "hello" },
      ]);
      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      assert.deepEqual(chunks, ["Hello", "!"]);
      assert.match(sentBody, /"model":"llama3\.2:3b"/);
      assert.match(sentBody, /"stream":true/);
    } finally {
      if (previousBaseUrl === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = previousBaseUrl;
      }
      if (previousModel === undefined) {
        delete process.env.OLLAMA_MODEL;
      } else {
        process.env.OLLAMA_MODEL = previousModel;
      }
    }
  });

  it("decodes streamed events, reports failures, and allows a retry stream", async () => {
    const output: string[] = [];
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('data: {"type":"delta","content":"first'),
          );
          controller.enqueue(
            new TextEncoder().encode('"}\n\ndata: {"type":"done"}\n\n'),
          );
          controller.close();
        },
      }),
    );
    await consumeChatEventStream(response, (chunk) => output.push(chunk));
    assert.deepEqual(output, ["first"]);

    await assert.rejects(
      consumeChatEventStream(
        new Response('data: {"type":"error","message":"Retry this message."}\n\n'),
        () => undefined,
      ),
      /Retry this message/,
    );

    const retried: string[] = [];
    await consumeChatEventStream(
      new Response(
        'data: {"type":"delta","content":"retried"}\n\ndata: {"type":"done"}\n\n',
      ),
      (chunk) => retried.push(chunk),
    );
    assert.deepEqual(retried, ["retried"]);
  });
});
