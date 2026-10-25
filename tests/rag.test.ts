import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRagService,
  cosineSimilarity,
  getDocumentDepartmentScope,
  RagServiceError,
  splitDocumentText,
  type RagChunkInput,
  type RagRepository,
  type StoredRagChunk,
} from "@/lib/rag/core";
import { createOllamaEmbeddingProvider } from "@/lib/rag/ollama-embeddings";

const originalEmbeddingModel = process.env.OLLAMA_EMBEDDING_MODEL;
const originalOllamaBaseUrl = process.env.OLLAMA_BASE_URL;

function restoreEnvironment() {
  if (originalEmbeddingModel === undefined) {
    delete process.env.OLLAMA_EMBEDDING_MODEL;
  } else {
    process.env.OLLAMA_EMBEDDING_MODEL = originalEmbeddingModel;
  }
  if (originalOllamaBaseUrl === undefined) {
    delete process.env.OLLAMA_BASE_URL;
  } else {
    process.env.OLLAMA_BASE_URL = originalOllamaBaseUrl;
  }
}

function createService(options: {
  role?: "ADMIN" | "HR" | "MANAGER" | "EMPLOYEE";
  chunks?: StoredRagChunk[];
  embed?: (inputs: string[]) => Promise<number[][]>;
  onCreate?: (input: {
    name: string;
    departmentId: string | null;
    uploadedById: string;
    sizeBytes: number;
    embeddingModel: string;
    chunks: RagChunkInput[];
  }) => void;
} = {}) {
  const stored: {
    name: string;
    departmentId: string | null;
    uploadedById: string;
    sizeBytes: number;
    embeddingModel: string;
    chunks: RagChunkInput[];
  }[] = [];
  let session: { user?: { id?: string; role?: "ADMIN" | "HR" | "MANAGER" | "EMPLOYEE" } } | null = {
    user: { id: "user-1", role: options.role ?? "HR" },
  };
  let scope: { userId: string; role: string; model: string } | null = null;
  const repository: RagRepository = {
    async createDocument(input) {
      stored.push(input);
      options.onCreate?.(input);
      return {
        id: "document-1",
        name: input.name,
        chunkCount: input.chunks.length,
      };
    },
    async departmentExists(id) {
      return id === "department-1";
    },
    async findAccessibleChunks(userId, role, model) {
      scope = { userId, role, model };
      return options.chunks ?? [];
    },
  };
  const embeddings = {
    model: "nomic-embed-text",
    async embed(inputs: string[]) {
      return options.embed
        ? options.embed(inputs)
        : inputs.map(() => [1, 0]);
    },
  };
  return {
    service: createRagService({
      async getSession() {
        return session;
      },
      repository,
      embeddings,
    }),
    stored,
    get scope() {
      return scope;
    },
    setSession(value: typeof session) {
      session = value;
    },
  };
}

function documentRequest(value: unknown) {
  return new Request("http://localhost/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("RAG foundation", () => {
  it("splits plain text into bounded overlapping chunks", () => {
    const text = Array.from({ length: 20 }, (_, index) => `word${index}`).join(" ");
    const chunks = splitDocumentText(text, 30, 8);

    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => chunk.length <= 30));
    assert.ok(chunks[0]!.split(" ").some((word) => chunks[1]!.includes(word)));
    assert.deepEqual(splitDocumentText(" \r\n "), []);
  });

  it("limits document department scope to existing access rules", () => {
    assert.deepEqual(getDocumentDepartmentScope("ADMIN", "department-1"), {
      kind: "all",
    });
    assert.deepEqual(getDocumentDepartmentScope("HR", null), { kind: "all" });
    assert.deepEqual(
      getDocumentDepartmentScope("MANAGER", "department-1"),
      { kind: "departments", departmentIds: [null, "department-1"] },
    );
    assert.deepEqual(getDocumentDepartmentScope("EMPLOYEE", "department-1"), {
      kind: "departments",
      departmentIds: [null],
    });
  });

  it("ingests and stores text chunks with model and document metadata", async () => {
    let sentInputs: string[] = [];
    const fixture = createService({
      role: "HR",
      embed: async (inputs) => {
        sentInputs = inputs;
        return inputs.map((_, index) => [index + 1, 0]);
      },
    });
    const response = await fixture.service.ingest(
      documentRequest({
        name: "Leave policy",
        departmentId: "department-1",
        content: "Annual leave is requested through the HR portal.",
      }),
    );

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      document: { id: "document-1", name: "Leave policy", chunkCount: 1 },
    });
    assert.deepEqual(sentInputs, ["Annual leave is requested through the HR portal."]);
    assert.equal(fixture.stored[0]?.departmentId, "department-1");
    assert.equal(fixture.stored[0]?.uploadedById, "user-1");
    assert.equal(fixture.stored[0]?.embeddingModel, "nomic-embed-text");
    assert.deepEqual(fixture.stored[0]?.chunks[0]?.embedding, [1, 0]);
  });

  it("blocks unauthorized and oversized ingestion before embedding", async () => {
    let embedCalls = 0;
    const denied = createService({
      role: "EMPLOYEE",
      embed: async () => {
        embedCalls += 1;
        return [[1, 0]];
      },
    });
    const unauthorizedResponse = await denied.service.ingest(
      documentRequest({ name: "Policy", content: "Private text" }),
    );
    assert.equal(unauthorizedResponse.status, 403);

    const authorized = createService({
      role: "ADMIN",
      embed: async () => {
        embedCalls += 1;
        return [[1, 0]];
      },
    });
    const oversizedResponse = await authorized.service.ingest(
      documentRequest({ name: "Large", content: "x".repeat(100_001) }),
    );
    assert.equal(oversizedResponse.status, 413);
    assert.equal(embedCalls, 0);

    const unauthenticated = createService();
    unauthenticated.setSession(null);
    const unauthenticatedResponse = await unauthenticated.service.ingest(
      documentRequest({ name: "Policy", content: "Text" }),
    );
    assert.equal(unauthenticatedResponse.status, 401);
  });

  it("returns actionable errors when the local embedding model is unavailable", async () => {
    const fixture = createService({
      embed: async () => {
        throw new RagServiceError(
          'Embedding model "nomic-embed-text" is not installed locally. Install it with "ollama pull nomic-embed-text".',
        );
      },
    });
    const response = await fixture.service.ingest(
      documentRequest({ name: "Policy", content: "Annual leave policy." }),
    );
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 503);
    assert.match(body.error, /ollama pull nomic-embed-text/);
    assert.equal(fixture.stored.length, 0);
  });

  it("retrieves only repository-authorized chunks in semantic order", async () => {
    const fixture = createService({
      role: "MANAGER",
      chunks: [
        {
          id: "irrelevant",
          chunkIndex: 0,
          content: "unrelated",
          embedding: [0, 1],
          document: { id: "doc-1", name: "Other" },
        },
        {
          id: "relevant",
          chunkIndex: 2,
          content: "Annual leave is twenty days.",
          embedding: [1, 0],
          document: { id: "doc-2", name: "Leave policy" },
        },
      ],
    });
    const context = await fixture.service.retrieveContext(
      "manager-1",
      "MANAGER",
      "How much annual leave?",
    );

    assert.match(context ?? "", /Leave policy; chunk 3/);
    assert.ok((context?.indexOf("Leave policy") ?? -1) < (context?.indexOf("Other") ?? -1));
    assert.deepEqual(fixture.scope, {
      userId: "manager-1",
      role: "MANAGER",
      model: "nomic-embed-text",
    });
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  it("reports a missing local embedding model with an install command", async () => {
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
    try {
      const provider = createOllamaEmbeddingProvider(async (input) => {
        assert.equal(input, "http://127.0.0.1:11434/api/tags");
        return Response.json({ models: [] });
      });
      await assert.rejects(
        provider.embed(["text"]),
        /ollama pull nomic-embed-text/,
      );
    } finally {
      restoreEnvironment();
    }
  });

  it("checks locally installed models and requests Ollama embeddings", async () => {
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    process.env.OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
    const calls: string[] = [];
    try {
      const provider = createOllamaEmbeddingProvider(async (input, init) => {
        calls.push(String(input));
        if (String(input).endsWith("/api/tags")) {
          return Response.json({ models: [{ name: "nomic-embed-text:latest" }] });
        }
        assert.equal(init?.method, "POST");
        assert.deepEqual(JSON.parse(String(init?.body)), {
          model: "nomic-embed-text",
          input: ["text one", "text two"],
          truncate: false,
        });
        return Response.json({ embeddings: [[1, 0], [0, 1]] });
      });
      assert.deepEqual(await provider.embed(["text one", "text two"]), [
        [1, 0],
        [0, 1],
      ]);
      assert.deepEqual(calls, [
        "http://127.0.0.1:11434/api/tags",
        "http://127.0.0.1:11434/api/embed",
      ]);
    } finally {
      restoreEnvironment();
    }
  });
});
