import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { streamChatQuery } from "@/lib/ragApi";

// ── Markdown renderer ────────────────────────────────────────────────────────
function MarkdownContent({ content, streaming }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert
                    prose-p:my-1 prose-ul:my-1 prose-ol:my-1
                    prose-li:my-0 prose-headings:my-2
                    prose-code:bg-muted prose-code:px-1 prose-code:rounded
                    prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-lg">
      <ReactMarkdown>{content}</ReactMarkdown>
      {streaming && (
        <span className="inline-block w-[2px] h-[14px] bg-foreground ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}

// ── Loading state component ──────────────────────────────────────────────────
function ThinkingIndicator({ stage }) {
  const stages = {
    retrieving: { label: "Searching documents…", width: "w-1/3" },
    reranking:  { label: "Ranking results…",     width: "w-2/3" },
    generating: { label: "Generating answer…",   width: "w-full" },
  };

  const current = stages[stage] || stages.retrieving;

  return (
    <div className="flex items-start">
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 w-56 flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{current.label}</span>
        <div className="h-1 w-full bg-muted-foreground/20 rounded-full overflow-hidden">
          <div
            className={`h-full bg-primary rounded-full transition-all duration-700 ${current.width}`}
          />
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <MarkdownContent content={message.content} streaming={message.streaming} />
        )}
      </div>

      {/* Source chips */}
      {!isUser && message.sources?.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[75%] px-1">
          {message.sources.map((source, i) => (
            <span
              key={i}
              title={source.text}
              className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full"
            >
              p.{source.page} · {source.type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      content: "Hello! Ask me anything about your documents.",
      sources: [],
      streaming: false,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("retrieving");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  function handleNewChat() {
    setMessages([
      {
        id: Date.now(),
        role: "assistant",
        content: "Hello! Ask me anything about your documents.",
        sources: [],
        streaming: false,
      },
    ]);
    setInput("");
  }

  async function handleSend() {
    const query = input.trim();
    if (!query || isLoading) return;

    const userMsg = {
      id: Date.now(),
      role: "user",
      content: query,
      sources: [],
      streaming: false,
    };
    const assistantId = Date.now() + 1;
    const assistantMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);
    setLoadingStage("retrieving"); // pipeline starts with retrieval

    await streamChatQuery(query, {
      onSources: (sources) => {
        // Sources arrive after reranking — move to generating stage
        setLoadingStage("generating");
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
        );
      },

      onToken: (token) => {
        // First token means generation started — hide the indicator
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m
          )
        );
      },

      onDone: () => {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m
          )
        );
      },

      onError: (err) => {
        setIsLoading(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${err}`, streaming: false }
              : m
          )
        );
      },
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const lastMsg = messages.at(-1);
  const waitingForFirstToken =
    isLoading && lastMsg?.role === "assistant" && lastMsg?.content === "";

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold tracking-tight">RAG Chat</h1>
        <Button variant="outline" size="sm" onClick={handleNewChat}>
          New Chat
        </Button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Loading indicator — shows pipeline stage */}
          {waitingForFirstToken && <ThinkingIndicator stage={loadingStage} />}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* Input */}
      <footer className="border-t border-border px-6 py-4">
        <div className="max-w-2xl mx-auto flex gap-3 items-end">
          <textarea
            className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring
                       min-h-[48px] max-h-[160px]"
            placeholder="Ask a question…"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="h-12 px-5"
          >
            {isLoading ? "..." : "Send"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function CopyButton({ content }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const clean = content
      .replace(/\[(\d+)\]/g, "")
      .replace(/\*\*/g, "")
      .replace(/#{1,6} /g, "")
      .trim();
    await navigator.clipboard.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Copy response"
    >
      {copied ? "✓ Copied" : "📋 Copy"}
    </button>
  );
}