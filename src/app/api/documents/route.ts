import { ragService } from "@/lib/rag/server";

export async function POST(request: Request) {
  return ragService.ingest(request);
}
