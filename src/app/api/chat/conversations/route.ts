import { chatApi } from "@/lib/chat/server";

export async function GET(request: Request) {
  return chatApi.listConversations(request);
}

export async function POST(request: Request) {
  return chatApi.createConversation(request);
}
