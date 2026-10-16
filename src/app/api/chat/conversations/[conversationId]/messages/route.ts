import { chatApi } from "@/lib/chat/server";

interface ConversationMessagesRouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function POST(
  request: Request,
  context: ConversationMessagesRouteContext,
) {
  const { conversationId } = await context.params;
  return chatApi.sendMessage(request, conversationId);
}
