import { chatApi } from "@/lib/chat/server";

interface ConversationRouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: Request, context: ConversationRouteContext) {
  const { conversationId } = await context.params;
  return chatApi.getConversation(request, conversationId);
}

export async function PATCH(request: Request, context: ConversationRouteContext) {
  const { conversationId } = await context.params;
  return chatApi.renameConversation(request, conversationId);
}

export async function DELETE(request: Request, context: ConversationRouteContext) {
  const { conversationId } = await context.params;
  return chatApi.deleteConversation(request, conversationId);
}
