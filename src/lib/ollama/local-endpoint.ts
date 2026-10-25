export function getLocalOllamaBaseUrl(): string {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("The local AI service is not configured.");
  }

  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";

  if (
    !isLoopback ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("The local AI service must use a loopback URL.");
  }

  return url.toString().replace(/\/+$/, "");
}
