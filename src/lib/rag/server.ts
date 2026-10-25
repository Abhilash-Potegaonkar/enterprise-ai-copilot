import "server-only";
import { randomUUID } from "node:crypto";
import type { UserRole } from "@/types";
import { prisma } from "@/lib/db/prisma";
import { auth } from "../../../auth";
import { createOllamaEmbeddingProvider } from "./ollama-embeddings";
import {
  getDocumentDepartmentScope,
  MAX_RETRIEVAL_CANDIDATES,
  createRagService,
  type RagRepository,
} from "./core";

const embeddings = createOllamaEmbeddingProvider();

const repository: RagRepository = {
  async createDocument(input) {
    const document = await prisma.document.create({
      data: {
        name: input.name,
        storageKey: `database:${randomUUID()}`,
        mimeType: "text/plain",
        sizeBytes: BigInt(input.sizeBytes),
        departmentId: input.departmentId,
        uploadedById: input.uploadedById,
        chunks: {
          create: input.chunks.map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            embeddingModel: input.embeddingModel,
            embedding: chunk.embedding,
          })),
        },
      },
      select: { id: true, name: true, chunks: { select: { id: true } } },
    });

    return {
      id: document.id,
      name: document.name,
      chunkCount: document.chunks.length,
    };
  },

  async departmentExists(id: string) {
    return (
      (await prisma.department.count({ where: { id } })) > 0
    );
  },

  async findAccessibleChunks(userId, role, embeddingModel) {
    let departmentId: string | null = null;
    if (role === "MANAGER") {
      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { departmentId: true },
      });
      departmentId = employee?.departmentId ?? null;
    }
    const scope = getDocumentDepartmentScope(role, departmentId);

    const chunks = await prisma.documentChunk.findMany({
      where: {
        embeddingModel,
        ...(scope.kind === "departments"
          ? {
              document: {
                is: {
                  OR: scope.departmentIds.map((value) => ({
                    departmentId: value,
                  })),
                },
              },
            }
          : {}),
      },
      orderBy: [{ document: { createdAt: "desc" } }, { chunkIndex: "asc" }],
      take: MAX_RETRIEVAL_CANDIDATES,
      select: {
        id: true,
        chunkIndex: true,
        content: true,
        embedding: true,
        document: { select: { id: true, name: true } },
      },
    });

    return chunks;
  },
};

export const ragService = createRagService({
  getSession: auth,
  repository,
  embeddings,
});

export async function getChatDocumentContext(
  userId: string,
  role: UserRole | undefined,
  query: string,
) {
  if (!role) {
    return null;
  }
  return ragService.retrieveContext(userId, role, query);
}
