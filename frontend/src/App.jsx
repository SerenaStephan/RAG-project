import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import {
  streamChatQuery,
  createConversation,
  fetchConversations,
  fetchConversation,
} from "@/lib/ragApi";

// ── Custom Tour ───────────────────────────────────────────────────────────────
const TOUR_STEPS = [
  { title: "Conversation History", body: "All your past chats are saved here automatically. Click any conversation to resume it." },
  { title: "New Chat", body: "Click '+ New Chat' to start a fresh conversation at any time." },
  { title: "Ask a Question", body: "Type your question and press Enter to send. Use Shift+Enter for a new line." },
  { title: "Streaming Answers", body: "Answers stream in word by word. Source page references appear below each response." },
];

function Tour({ onClose }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-2xl shadow-xl p-6 w-80 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            Skip
          </button>
        </div>
        <div>
          <h3 className="font-semibold text-base mb-1">{current.title}</h3>
          <p className="text-sm text-muted-foreground">{current.body}</p>
        </div>
        <div className="flex gap-2 justify-end">
          {step > 0 && (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button size="sm" onClick={() => isLast ? onClose() : setStep(step + 1)}>
            {isLast ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
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

// ── Loading indicator ─────────────────────────────────────────────────────────
function ThinkingIndicator({ stage }) {
  const stages = {
    retrieving: { label: "Searching documents…", width: "w-1/3" },
    generating: { label: "Generating answer…",   width: "w-2/3" },
  };
  const current = stages[stage] || stages.retrieving;
  return (
    <div className="flex items-start">
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 w-56 flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{current.label}</span>
        <div className="h-1 w-full bg-muted-foreground/20 rounded-full overflow-hidden">
          <div className={`h-full bg-primary rounded-full transition-all duration-700 ${current.width}`} />
        </div>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted text-foreground rounded-tl-sm"
      }`}>
        {isUser ? message.content : (
          <MarkdownContent content={message.content} streaming={message.streaming} />
        )}
      </div>
      {!isUser && message.sources?.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[75%] px-1">
          {message.sources.map((s, i) => (
            <span key={i} title={s.text}
              className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
              p.{s.page} · {s.type}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ conversations, activeId, onSelect, onNewChat }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-muted/30">
      <div className="p-4 border-b border-border">
        <Button className="w-full" onClick={onNewChat}>
          + New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors
              ${activeId === c.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"}`}
          >
            {c.title}
          </button>
        ))}
      </div>
    </aside>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("retrieving");
  const [showTour, setShowTour] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    fetchConversations().then(setConversations).catch(console.error);
    if (!localStorage.getItem("tour_done")) setShowTour(true);
  }, []);

  function handleCloseTour() {
    localStorage.setItem("tour_done", "1");
    setShowTour(false);
  }

  async function handleSelectConversation(id) {
    setActiveId(id);
    const convo = await fetchConversation(id);
    const loaded = convo.messages.map((m, i) => ({
      id: i, role: m.role, content: m.content,
      sources: m.sources || [], streaming: false,
    }));
    setMessages(loaded);
  }

  async function handleNewChat() {
    const convo = await createConversation("New Conversation");
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
    setMessages([]);
    setInput("");
  }

  async function handleSend() {
    const query = input.trim();
    if (!query || isLoading) return;

    let convId = activeId;
    if (!convId) {
      const convo = await createConversation("New Conversation");
      setConversations((prev) => [convo, ...prev]);
      setActiveId(convo.id);
      convId = convo.id;
    }

    const userMsg = { id: Date.now(), role: "user", content: query, sources: [], streaming: false };
    const assistantId = Date.now() + 1;
    const assistantMsg = { id: assistantId, role: "assistant", content: "", sources: [], streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);
    setLoadingStage("retrieving");

    await streamChatQuery(query, convId, {
      onSources: (sources) => {
        setLoadingStage("generating");
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, sources } : m));
      },
      onToken: (token) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + token } : m));
      },
      onTitle: (title, cid) => {
        setConversations((prev) => prev.map((c) => c.id === cid ? { ...c, title } : c));
      },
      onDone: () => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, streaming: false } : m));
      },
      onError: (err) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${err}`, streaming: false } : m
        ));
      },
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const waitingForFirstToken =
    isLoading && messages.at(-1)?.role === "assistant" && messages.at(-1)?.content === "";

  return (
    <div className="flex h-screen bg-background text-foreground">
      {showTour && <Tour onClose={handleCloseTour} />}

      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold tracking-tight">RAG Chat</h1>
          <Button variant="outline" size="sm" onClick={() => setShowTour(true)}>
            ? Tour
          </Button>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {messages.length === 0 && !isLoading && (
              <p className="text-center text-muted-foreground text-sm mt-20">
                Ask anything about your documents to get started.
              </p>
            )}
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
            {waitingForFirstToken && <ThinkingIndicator stage={loadingStage} />}
            <div ref={bottomRef} />
          </div>
        </main>

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
            <Button onClick={handleSend} disabled={!input.trim() || isLoading} className="h-12 px-5">
              {isLoading ? "..." : "Send"}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
