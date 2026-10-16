import "server-only";
import { MessageRole } from "@prisma/client";
import { auth } from "../../../auth";
import { prisma } from "@/lib/db/prisma";
import {
  createChatApi,
  createUserRateLimiter,
  type ChatMessageRecord,
} from "./api";
import { createOllamaProvider } from "./ollama-provider";

function toChatMessage(message: {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
}): ChatMessageRecord {
  return {
    id: message.id,
    role: message.role === MessageRole.USER ? "USER" : "ASSISTANT",
    content: message.content,
    createdAt: message.createdAt,
  };
}

const chatRepository = {
  async listConversations(userId: string) {
    return prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { id: true, title: true, updatedAt: true },
    });
  },

  async createConversation(userId: string) {
    return prisma.conversation.create({
      data: { userId },
      select: { id: true, title: true, updatedAt: true },
    });
  },

  async getConversation(userId: string, conversationId: string) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          where: {
            role: { in: [MessageRole.USER, MessageRole.ASSISTANT] },
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      return null;
    }

    return {
      ...conversation,
      messages: conversation.messages.reverse().map(toChatMessage),
    };
  },

  async renameConversation(
    userId: string,
    conversationId: string,
    title: string,
  ) {
    const updated = await prisma.conversation.updateMany({
      where: { id: conversationId, userId },
      data: { title },
    });
    if (updated.count === 0) {
      return null;
    }

    return prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true, title: true, updatedAt: true },
    });
  },

  async deleteConversation(userId: string, conversationId: string) {
    const deleted = await prisma.conversation.deleteMany({
      where: { id: conversationId, userId },
    });
    return deleted.count > 0;
  },

  async createUserMessage(
    userId: string,
    conversationId: string,
    content: string,
    requestId: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true, title: true },
      });
      if (!conversation) {
        return { status: "not-found" as const };
      }

      const previousMessage = await transaction.message.findFirst({
        where: {
          conversationId,
          clientRequestId: requestId,
          role: MessageRole.USER,
        },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      });

      if (previousMessage && previousMessage.content !== content) {
        return { status: "conflict" as const };
      }

      const userMessage =
        previousMessage ??
        (await transaction.message.upsert({
          where: {
            conversationId_clientRequestId_role: {
              conversationId,
              clientRequestId: requestId,
              role: MessageRole.USER,
            },
          },
          update: {},
          create: {
            conversationId,
            authorId: userId,
            role: MessageRole.USER,
            content,
            clientRequestId: requestId,
          },
          select: {
            id: true,
            role: true,
            content: true,
            createdAt: true,
          },
        }));

      if (userMessage.content !== content) {
        return { status: "conflict" as const };
      }

      if (!previousMessage) {
        await transaction.conversation.updateMany({
          where: { id: conversationId, userId },
          data: {
            title:
              conversation.title === "New conversation"
                ? content.slice(0, 80)
                : conversation.title,
            updatedAt: new Date(),
          },
        });
      }

      const assistantMessage = await transaction.message.findFirst({
        where: {
          conversationId,
          clientRequestId: requestId,
          role: MessageRole.ASSISTANT,
        },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      });

      return {
        status: previousMessage ? "existing" as const : "created" as const,
        userMessage: toChatMessage(userMessage),
        assistantMessage: assistantMessage
          ? toChatMessage(assistantMessage)
          : null,
      };
    });
  },

  async saveAssistantMessage(
    userId: string,
    conversationId: string,
    content: string,
    requestId: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!conversation) {
        return null;
      }

      const userMessage = await transaction.message.findFirst({
        where: {
          conversationId,
          clientRequestId: requestId,
          role: MessageRole.USER,
        },
        select: { id: true },
      });
      if (!userMessage) {
        return null;
      }

      const assistantMessage = await transaction.message.upsert({
        where: {
          conversationId_clientRequestId_role: {
            conversationId,
            clientRequestId: requestId,
            role: MessageRole.ASSISTANT,
          },
        },
        update: {},
        create: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content,
          clientRequestId: requestId,
        },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      });

      return toChatMessage(assistantMessage);
    });
  },
};

export const chatApi = createChatApi({
  getSession: auth,
  repository: chatRepository,
  provider: createOllamaProvider(),
  rateLimiter: createUserRateLimiter(),
});
