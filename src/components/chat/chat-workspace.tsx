"use client";

import {
  Bot,
  Check,
  LoaderCircle,
  MessageSquareText,
  Plus,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { consumeChatEventStream } from "@/lib/chat/streaming";

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface StoredMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

interface ChatConversation extends ConversationSummary {
  messages: StoredMessage[];
}

interface UiMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  requestId?: string;
  failed?: boolean;
}

function errorFromResponse(response: Response): Promise<string> {
  return response.text().then((text) => {
    try {
      const payload: { error?: string } = JSON.parse(text) as { error?: string };
      return typeof payload.error === "string"
        ? payload.error
        : "The request could not be completed.";
    } catch {
      return "The request could not be completed.";
    }
  });
}

export function ChatWorkspace() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const conversationRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadConversations() {
      setIsLoadingHistory(true);
      setError(null);
      try {
        const response = await fetch("/api/chat/conversations", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(await errorFromResponse(response));
        }
        const payload: { conversations: ConversationSummary[] } =
          (await response.json()) as { conversations: ConversationSummary[] };
        if (active) {
          setConversations(payload.conversations);
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Conversation history could not be loaded.",
          );
        }
      } finally {
        if (active) {
          setIsLoadingHistory(false);
        }
      }
    }

    void loadConversations();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function selectConversation(conversationId: string) {
    if (sendingRef.current) {
      return;
    }
    const requestNumber = ++conversationRequestRef.current;
    setIsLoadingConversation(true);
    setError(null);
    setSelectedConversationId(conversationId);
    setMessages([]);
    try {
      const response = await fetch(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(await errorFromResponse(response));
      }
      const payload: { conversation: ChatConversation } =
        (await response.json()) as { conversation: ChatConversation };
      if (conversationRequestRef.current === requestNumber) {
        setMessages(
          payload.conversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          })),
        );
      }
    } catch (cause) {
      if (conversationRequestRef.current === requestNumber) {
        setError(
          cause instanceof Error ? cause.message : "Conversation could not be loaded.",
        );
      }
    } finally {
      if (conversationRequestRef.current === requestNumber) {
        setIsLoadingConversation(false);
      }
    }
  }

  async function deleteConversation(conversationId: string) {
    if (sendingRef.current) {
      return;
    }
    try {
      const response = await fetch(
        `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setError(await errorFromResponse(response));
        return;
      }
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      if (selectedConversationId === conversationId) {
        conversationRequestRef.current += 1;
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch {
      setError("The conversation could not be deleted. Please try again.");
    }
  }

  async function sendMessage(
    content: string,
    requestId: string,
    conversationId: string | null,
  ) {
    sendingRef.current = true;
    setIsSending(true);
    setError(null);

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const createResponse = await fetch("/api/chat/conversations", {
          method: "POST",
        });
        if (!createResponse.ok) {
          throw new Error(await errorFromResponse(createResponse));
        }
        const payload: { conversation: ConversationSummary } =
          (await createResponse.json()) as { conversation: ConversationSummary };
        activeConversationId = payload.conversation.id;
        setSelectedConversationId(activeConversationId);
        setConversations((current) => [payload.conversation, ...current]);
      }

      const response = await fetch(
        `/api/chat/conversations/${encodeURIComponent(activeConversationId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, requestId }),
        },
      );
      if (!response.ok) {
        throw new Error(await errorFromResponse(response));
      }

      await consumeChatEventStream(response, (delta) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === `assistant-${requestId}`
              ? { ...message, content: message.content + delta }
              : message,
          ),
        );
      });

      const historyResponse = await fetch("/api/chat/conversations", {
        cache: "no-store",
      });
      if (historyResponse.ok) {
        const payload: { conversations: ConversationSummary[] } =
          (await historyResponse.json()) as { conversations: ConversationSummary[] };
        setConversations(payload.conversations);
      }
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "The assistant could not complete this response.";
      setMessages((current) =>
        current.map((item) =>
          item.id === `assistant-${requestId}`
            ? { ...item, failed: true }
            : item,
        ),
      );
      setError(message);
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  }

  function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sendingRef.current) {
      return;
    }

    const requestId = crypto.randomUUID();
    setInput("");
    setMessages((current) => [
      ...current,
      { id: requestId, role: "USER", content, requestId },
      { id: `assistant-${requestId}`, role: "ASSISTANT", content: "", requestId },
    ]);
    void sendMessage(content, requestId, selectedConversationId);
  }

  function retryMessage(message: UiMessage) {
    if (!message.requestId || sendingRef.current) {
      return;
    }
    const userMessage = messages.find(
      (candidate) => candidate.requestId === message.requestId && candidate.role === "USER",
    );
    if (!userMessage) {
      return;
    }
    setMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, content: "", failed: false } : item,
      ),
    );
    void sendMessage(userMessage.content, message.requestId, selectedConversationId);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#e8efeb] text-green">
            <Sparkles aria-hidden="true" size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-green">
              Private workspace assistant
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">
              AI Chat
            </h1>
            <p className="mt-1 text-sm text-muted">
              Ask a question. Your conversations are private to your account.
            </p>
          </div>
          <span className="ml-auto hidden items-center gap-2 rounded-full bg-[#eef5ef] px-3 py-1.5 text-xs font-medium text-green sm:flex">
            <span className="size-1.5 rounded-full bg-[#5d9b71]" />
            Local provider
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          aria-label="Conversation history"
          className="border-b border-line bg-[#fafbf9] p-3 md:w-64 md:shrink-0 md:border-b-0 md:border-r md:p-4"
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              History
            </h2>
            <Button
              aria-label="Start a new conversation"
              className="size-8"
              disabled={isSending}
              onClick={() => {
                conversationRequestRef.current += 1;
                setSelectedConversationId(null);
                setMessages([]);
                setIsLoadingConversation(false);
                setError(null);
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus aria-hidden="true" size={17} />
            </Button>
          </div>
          <div className="flex max-h-28 gap-2 overflow-x-auto pb-1 md:max-h-[min(55vh,34rem)] md:flex-col md:overflow-y-auto md:overflow-x-hidden">
            {isLoadingHistory ? (
              <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted">
                <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
                Loading history…
              </p>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-3 text-xs leading-5 text-muted">
                Your saved conversations will appear here.
              </p>
            ) : (
              conversations.map((conversation) => (
                <div
                  className={`group flex min-w-48 items-center rounded-md border px-2 py-2 md:min-w-0 ${
                    selectedConversationId === conversation.id
                      ? "border-[#c7d8cd] bg-[#e8efeb]"
                      : "border-transparent hover:bg-white"
                  }`}
                  key={conversation.id}
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={isSending}
                    onClick={() => void selectConversation(conversation.id)}
                    type="button"
                  >
                    <MessageSquareText
                      aria-hidden="true"
                      className="shrink-0 text-muted"
                      size={15}
                    />
                    <span className="truncate">{conversation.title}</span>
                  </button>
                  <button
                    aria-label={`Delete conversation: ${conversation.title}`}
                    className="ml-1 flex size-7 shrink-0 items-center justify-center rounded text-muted opacity-70 hover:bg-white hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:opacity-0 md:group-hover:opacity-100"
                    disabled={isSending}
                    onClick={() => void deleteConversation(conversation.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        <div className="flex min-h-[30rem] min-w-0 flex-1 flex-col">
          <div
            aria-label="Chat messages"
            aria-live="polite"
            className="flex-1 space-y-5 overflow-y-auto px-4 py-6 sm:px-7"
            role="log"
          >
            {isLoadingConversation ? (
              <div className="flex min-h-[18rem] items-center justify-center gap-2 text-sm text-muted">
                <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                Loading conversation…
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 text-center">
                <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-[#e8efeb] text-green">
                  <Bot aria-hidden="true" size={22} />
                </span>
                <h2 className="text-base font-semibold">What can I help with?</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                  Start with a question or a task. The assistant will respond using the
                  configured local language model.
                </p>
                <span className="mt-4 rounded-md border border-line bg-[#fafbf9] px-3 py-2 text-xs text-muted">
                  Example: “Summarize a clear agenda for a weekly team check-in.”
                </span>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  aria-label={message.role === "USER" ? "Your message" : "Assistant response"}
                  className={`flex gap-3 ${
                    message.role === "USER" ? "flex-row-reverse" : "flex-row"
                  }`}
                  key={message.id}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      message.role === "USER"
                        ? "bg-[#f0d8ca] text-[#6b3e2f]"
                        : "bg-[#e8efeb] text-green"
                    }`}
                  >
                    {message.role === "USER" ? (
                      <UserRound size={16} />
                    ) : (
                      <Bot size={16} />
                    )}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6 sm:max-w-[75%] ${
                      message.role === "USER"
                        ? "bg-[#19372c] text-white"
                        : "border border-line bg-[#fafbf9] text-foreground"
                    }`}
                  >
                    {message.content ? (
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    ) : null}
                    {message.failed ? (
                      <div className="flex flex-wrap items-center gap-2 text-destructive">
                        <span>Response interrupted.</span>
                        <button
                          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                          disabled={isSending}
                          onClick={() => retryMessage(message)}
                          type="button"
                        >
                          <span className="sr-only">Retry assistant response</span>
                          Retry
                        </button>
                      </div>
                    ) : !message.content && isSending ? (
                      <span className="flex items-center gap-2 text-muted">
                        <LoaderCircle
                          aria-label="Assistant is responding"
                          className="animate-spin"
                          size={15}
                        />
                        Thinking…
                      </span>
                    ) : null}
                    {message.role === "ASSISTANT" &&
                    message.content &&
                    !isSending &&
                    !message.failed ? (
                      <span className="mt-2 flex items-center gap-1 text-[10px] text-muted">
                        <Check aria-hidden="true" size={12} />
                        Complete
                      </span>
                    ) : null}
                  </div>
                </article>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {error ? (
            <div
              className="mx-4 mb-3 flex items-start justify-between gap-3 rounded-md border border-[#efc7c1] bg-[#fff7f5] px-4 py-3 text-sm text-destructive sm:mx-7"
              role="alert"
            >
              <p>{error}</p>
              <button
                aria-label="Dismiss error"
                className="shrink-0 font-medium underline underline-offset-2"
                onClick={() => setError(null)}
                type="button"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <form
            className="border-t border-line bg-white p-4 sm:px-7 sm:py-5"
            onSubmit={submitMessage}
          >
            <label className="sr-only" htmlFor="chat-message">
              Write a message
            </label>
            <div className="flex items-end gap-2 rounded-lg border border-line bg-[#fafbf9] p-2 focus-within:border-[#9bb6a5] focus-within:ring-2 focus-within:ring-[#9bb6a5]/30">
              <textarea
                autoComplete="off"
                className="max-h-36 min-h-11 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-5 outline-none placeholder:text-muted disabled:cursor-not-allowed"
                disabled={isSending || isLoadingConversation}
                id="chat-message"
                maxLength={4_000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Message the assistant…"
                rows={1}
                value={input}
              />
              <Button
                aria-label={isSending ? "Assistant is responding" : "Send message"}
                className="size-10 rounded-md"
                disabled={
                  isSending || isLoadingConversation || input.trim().length === 0
                }
                size="icon"
                type="submit"
              >
                {isSending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" size={17} />
                ) : (
                  <Send aria-hidden="true" size={17} />
                )}
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              Enter to send · Shift+Enter for a new line · Up to 4,000 characters
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
