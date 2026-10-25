import { getLocalOllamaBaseUrl } from "@/lib/ollama/local-endpoint";
import { RagServiceError, type EmbeddingProvider } from "./core";

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    remote_model?: string;
  }>;
}

interface OllamaEmbeddingsResponse {
  embeddings?: number[][];
}

export function createOllamaEmbeddingProvider(
  fetcher: typeof fetch = fetch,
): EmbeddingProvider {
  function getModel(): string {
    const model =
      process.env.OLLAMA_EMBEDDING_MODEL?.trim() || "nomic-embed-text";
    if (/(?:^|[-:])cloud(?:$|[-:])/i.test(model)) {
      throw new RagServiceError("Only locally installed embedding models are supported.");
    }
    return model;
  }

  async function request(
    url: string,
    init?: RequestInit,
  ): Promise<Response> {
    try {
      return await fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new RagServiceError("The local embedding model timed out.", 504);
      }
      throw new RagServiceError(
        "Ollama is unavailable. Start the local Ollama service and try again.",
      );
    }
  }

  return {
    get model() {
      return getModel();
    },

    async embed(inputs) {
      if (inputs.length === 0) {
        return [];
      }

      const model = getModel();
      let baseUrl: string;
      try {
        baseUrl = getLocalOllamaBaseUrl();
      } catch {
        throw new RagServiceError(
          "Configure OLLAMA_BASE_URL with a local loopback address.",
        );
      }

      const tagsResponse = await request(`${baseUrl}/api/tags`);
      if (!tagsResponse.ok) {
        throw new RagServiceError(
          "Ollama is unavailable. Start the local Ollama service and try again.",
        );
      }

      let tags: OllamaTagsResponse;
      try {
        const responseBody: unknown = await tagsResponse.json();
        if (
          typeof responseBody !== "object" ||
          responseBody === null ||
          Array.isArray(responseBody)
        ) {
          throw new Error("Invalid Ollama model list");
        }
        tags = responseBody as OllamaTagsResponse;
      } catch {
        throw new RagServiceError("Ollama returned an invalid model list.");
      }
      if (
        !Array.isArray(tags.models) ||
        !tags.models.some(
          (entry) =>
            typeof entry?.name === "string" &&
            (entry.name === model ||
              (entry.name === `${model}:latest` && !model.includes(":"))) &&
            !entry.remote_model &&
            !/(?:^|[-:])cloud(?:$|[-:])/i.test(entry.name ?? ""),
        )
      ) {
        throw new RagServiceError(
          `Embedding model "${model}" is not installed locally. Install it with "ollama pull ${model}" or set OLLAMA_EMBEDDING_MODEL to an installed embedding model.`,
        );
      }

      const embeddingResponse = await request(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: inputs, truncate: false }),
      });
      if (!embeddingResponse.ok) {
        throw new RagServiceError(
          `Ollama could not generate embeddings for "${model}". Check the local model and input size.`,
        );
      }

      let result: OllamaEmbeddingsResponse;
      try {
        result = (await embeddingResponse.json()) as OllamaEmbeddingsResponse;
      } catch {
        throw new RagServiceError("Ollama returned invalid embedding data.");
      }

      if (
        !Array.isArray(result.embeddings) ||
        result.embeddings.length !== inputs.length ||
        result.embeddings.some(
          (vector) =>
            !Array.isArray(vector) ||
            vector.length === 0 ||
            vector.some(
              (value) => typeof value !== "number" || !Number.isFinite(value),
            ),
        ) ||
        result.embeddings.some(
          (vector) => vector.length !== result.embeddings?.[0]?.length,
        )
      ) {
        throw new RagServiceError("Ollama returned invalid embedding vectors.");
      }

      return result.embeddings;
    },
  };
}
