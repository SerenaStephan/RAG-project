import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import {
  streamChatQuery,
  createConversation,
  fetchConversations,
  fetchConversation,
  regenerateMessage,
  setMessageVersion,
  submitFeedback,
} from "@/lib/ragApi";

const FEEDBACK_REASONS = [
  "Wrong answer",
  "Too vague",
  "Hallucination",
  "Missing sources",
  "Off topic",
  "Other",
];

const TOUR_STEPS = [
  { title: "Conversation History", body: "All your past chats are saved here automatically." },
  { title: "New Chat", body: "Click '+ New Chat' to start a fresh conversation." },
  { title: "Ask a Question", body: "Type your question and press Enter to send." },
  { title: "Regenerate & Compare", body: "Click ↻ to regenerate or ⇔ Compare to view two versions side by side." },
  { title: "Export", body: "Click Export to download the conversation as Markdown or PDF." },
];

// ── Export helpers ────────────────────────────────────────────────────────────
function buildMarkdown(title, messages) {
  const lines = [`# ${title}`, ""];
  for (const msg of messages) {
    if (msg.role === "user") {
      lines.push(`## You`, msg.content, "");
    } else {
      const versions = msg.versions || [{ content: msg.content || "", sources: msg.sources || [] }];
      const current = versions[msg.currentVersion ?? 0];
      lines.push(`## Assistant`, current.content, "");
      if (current.sources?.length) {
        lines.push("**Sources:**");
        current.sources.forEach((s, i) => {
          lines.push(`- [${i + 1}] p.${s.page} · ${s.type} — ${s.text?.slice(0, 120)}...`);
        });
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

function downloadMarkdown(title, messages) {
  const md = buildMarkdown(title, messages);
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function printAsPDF(title, messages) {
  const md = buildMarkdown(title, messages);
  const html = md
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>");

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; color: #111; line-height: 1.7; }
      h1 { font-size: 1.6rem; border-bottom: 2px solid #111; padding-bottom: 8px; }
      h2 { font-size: 1rem; font-weight: 700; color: #444; margin-top: 24px; }
      p { margin: 4px 0 12px; } ul { margin: 4px 0 12px; padding-left: 20px; }
      li { font-size: 0.85rem; color: #555; }
    </style></head><body>${html}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
}

function ExportMenu({ title, messages }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!messages.length) return null;

  return (
    <div className="relative" ref={ref}>
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>↓ Export</Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-1 w-44 flex flex-col">
          <button onClick={() => { downloadMarkdown(title, messages); setOpen(false); }}
            className="text-left text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors">📄 Markdown (.md)</button>
          <button onClick={() => { printAsPDF(title, messages); setOpen(false); }}
            className="text-left text-sm px-3 py-2 rounded-lg hover:bg-muted transition-colors">🖨️ PDF (print)</button>
        </div>
      )}
    </div>
  );
}

// ── Tour ──────────────────────────────────────────────────────────────────────
function Tour({ onClose }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background border border-border rounded-2xl shadow-xl p-6 w-80 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{step + 1} / {TOUR_STEPS.length}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">Skip</button>
        </div>
        <div>
          <h3 className="font-semibold text-base mb-1">{current.title}</h3>
          <p className="text-sm text-muted-foreground">{current.body}</p>
        </div>
        <div className="flex gap-2 justify-end">
          {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>Back</Button>}
          <Button size="sm" onClick={() => isLast ? onClose() : setStep(step + 1)}>
            {isLast ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Citation badge ────────────────────────────────────────────────────────────
function CitationBadge({ num, sources }) {
  const [visible, setVisible] = useState(false);
  const source = sources?.[num - 1];
  if (!source) return <span className="text-xs text-muted-foreground">[{num}]</span>;
  return (
    <span className="relative inline-block">
      <button
        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10
                   text-primary text-[10px] font-bold mx-0.5 hover:bg-primary/20 transition-colors"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible(!visible)}
      >
        {num}
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                        w-72 bg-popover border border-border rounded-xl shadow-lg p-3 text-xs">
          <div className="font-semibold text-foreground mb-1">p.{source.page} · {source.type}</div>
          <p className="text-muted-foreground line-clamp-4">{source.text}</p>
          <div className="text-[10px] text-muted-foreground/60 mt-1">Score: {source.rerank_score}</div>
        </div>
      )}
    </span>
  );
}

function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <span>{open ? "▾" : "▸"}</span>
        <span>{sources.length} source{sources.length > 1 ? "s" : ""}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {sources.map((s, i) => (
            <div key={i} className="bg-muted/50 rounded-xl p-3 text-xs border border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">[{i + 1}] p.{s.page} · {s.type}</span>
                <span className="text-muted-foreground/60">score: {s.rerank_score}</span>
              </div>
              <p className="text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CitedMarkdown({ content, streaming, sources }) {
  const segments = content.split(/(\[\d+\])/g);
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert
                    prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2
                    prose-code:bg-muted prose-code:px-1 prose-code:rounded">
      {segments.map((seg, i) => {
        const match = seg.match(/^\[(\d+)\]$/);
        if (match) return <CitationBadge key={i} num={parseInt(match[1])} sources={sources} />;
        return seg ? <ReactMarkdown key={i}>{seg}</ReactMarkdown> : null;
      })}
      {streaming && <span className="inline-block w-[2px] h-[14px] bg-foreground ml-0.5 animate-pulse align-middle" />}
    </div>
  );
}

// ── Compare view ──────────────────────────────────────────────────────────────
function CompareView({ versionA, versionB, streaming, onKeep, onClose }) {
  return (
    <div className="w-full border border-border rounded-2xl overflow-hidden mt-1">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">Comparing versions</span>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕ Exit compare</button>
      </div>

      <div className="grid grid-cols-2 divide-x divide-border">
        {/* Version A */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Version A</span>
            <button onClick={() => onKeep("A")}
              className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:opacity-90 transition-opacity">
              Keep A
            </button>
          </div>
          <div className="text-sm">
            <CitedMarkdown content={versionA.content} streaming={false} sources={versionA.sources} />
          </div>
          <SourcesPanel sources={versionA.sources} />
        </div>

        {/* Version B */}
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Version B</span>
            <button onClick={() => onKeep("B")} disabled={streaming}
              className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40">
              Keep B
            </button>
          </div>
          <div className="text-sm">
            {streaming && !versionB.content ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground italic">Generating version B…</p>
                <div className="h-1 w-full bg-muted-foreground/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
                </div>
              </div>
            ) : (
              <CitedMarkdown content={versionB.content} streaming={streaming} sources={versionB.sources} />
            )}
          </div>
          {!streaming && <SourcesPanel sources={versionB.sources} />}
        </div>
      </div>
    </div>
  );
}

// ── Other reason input ────────────────────────────────────────────────────────
function OtherReasonInput({ onSubmit, onCancel }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <input autoFocus
        className="text-xs border border-input rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="Describe the issue…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && text.trim()) onSubmit(text.trim());
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-1 justify-end">
        <button onClick={onCancel} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
        <button disabled={!text.trim()} onClick={() => onSubmit(text.trim())}
          className="text-[10px] text-primary hover:underline disabled:opacity-30">Submit</button>
      </div>
    </div>
  );
}

function FeedbackButtons({ message, activeId }) {
  const [status, setStatus] = useState(null);
  const [showReasons, setShowReasons] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentVersion = message.currentVersion ?? 0;

  async function handleUp() {
    if (status || submitting) return;
    setSubmitting(true);
    try {
      await submitFeedback({ conversationId: activeId, messageIndex: message.messageIndex, versionIndex: currentVersion, rating: "up", reason: null });
      setStatus("up");
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  }

  async function handleReason(reason) {
    setShowReasons(false);
    setSubmitting(true);
    try {
      await submitFeedback({ conversationId: activeId, messageIndex: message.messageIndex, versionIndex: currentVersion, rating: "down", reason });
      setStatus("down");
    } catch (e) { console.error(e); } finally { setSubmitting(false); }
  }

  return (
    <div className="relative flex items-center gap-1">
      <button onClick={handleUp} disabled={submitting || status !== null}
        className={`text-base transition-all ${status === "up" ? "opacity-100" : "opacity-40 hover:opacity-100"} disabled:cursor-default`}>👍</button>
      <button onClick={() => !status && !submitting && setShowReasons(true)} disabled={submitting || status !== null}
        className={`text-base transition-all ${status === "down" ? "opacity-100" : "opacity-40 hover:opacity-100"} disabled:cursor-default`}>👎</button>
      {showReasons && (
        <div className="absolute bottom-full left-0 mb-2 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 flex flex-col gap-1 w-52">
          <p className="text-xs font-semibold text-foreground px-2 py-1">Why was this bad?</p>
          {FEEDBACK_REASONS.map((reason) =>
            reason === "Other" ? (
              <OtherReasonInput key={reason} onSubmit={handleReason} onCancel={() => setShowReasons(false)} />
            ) : (
              <button key={reason} onClick={() => handleReason(reason)}
                className="text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-foreground">{reason}</button>
            )
          )}
          <button onClick={() => setShowReasons(false)}
            className="text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">Cancel</button>
        </div>
      )}
    </div>
  );
}

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
function MessageBubble({ message, onRegenerate, onCompare, onKeepVersion, activeId }) {
  const isUser = message.role === "user";
  const versions = message.versions || [{ content: message.content, sources: message.sources }];
  const currentIdx = message.currentVersion ?? 0;
  const current = versions[currentIdx];

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"} w-full`}>
      {!message.compareMode && (
        <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-sm"
            : "bg-muted text-foreground rounded-tl-sm"
        }`}>
          {isUser ? message.content : (
            <CitedMarkdown content={current.content} streaming={message.streaming} sources={current.sources} />
          )}
        </div>
      )}

      {!isUser && message.compareMode && (
        <CompareView
          versionA={current}
          versionB={{ content: message.compareContent || "", sources: message.compareSources || [] }}
          streaming={message.compareStreaming}
          onKeep={(side) => onKeepVersion(message.id, side)}
          onClose={() => onCompare(message.id, "close")}
        />
      )}

      {!isUser && !message.streaming && !message.compareMode && (
        <div className="flex items-center gap-3 px-1">
          {versions.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button disabled={currentIdx === 0} onClick={() => onRegenerate("prev", currentIdx - 1)}
                className="hover:text-foreground disabled:opacity-30">‹</button>
              <span>{currentIdx + 1} / {versions.length}</span>
              <button disabled={currentIdx === versions.length - 1} onClick={() => onRegenerate("next", currentIdx + 1)}
                className="hover:text-foreground disabled:opacity-30">›</button>
            </div>
          )}
          <button onClick={() => onRegenerate("regenerate")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors">↻ Regenerate</button>
          <button onClick={() => onCompare(message.id, "start")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors">⇔ Compare</button>
          {message.messageIndex != null && <FeedbackButtons message={message} activeId={activeId} />}
        </div>
      )}

      {!isUser && !message.compareMode && <SourcesPanel sources={current.sources} />}
    </div>
  );
}

function Sidebar({ conversations, activeId, onSelect, onNewChat }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border flex flex-col bg-muted/30">
      <div className="p-4 border-b border-border">
        <Button className="w-full" onClick={onNewChat}>+ New Chat</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mt-4">No conversations yet</p>
        )}
        {conversations.map((c) => (
          <button key={c.id} onClick={() => onSelect(c.id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors
              ${activeId === c.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}>
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
  const [activeTitle, setActiveTitle] = useState("New Conversation");
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
    setShowTour(true);
  }, []);

  async function handleSelectConversation(id) {
    setActiveId(id);
    const convo = await fetchConversation(id);
    setActiveTitle(convo.title);
    setMessages(convo.messages.map((m, i) => {
      if (m.role === "assistant") {
        return {
          id: i, role: "assistant",
          versions: m.versions || [{ content: m.content || "", sources: m.sources || [] }],
          currentVersion: m.current_version ?? 0,
          streaming: false, messageIndex: i,
          compareMode: false, compareContent: "", compareSources: [], compareStreaming: false,
        };
      }
      return { id: i, role: "user", content: m.content, sources: [], streaming: false, messageIndex: i };
    }));
  }

  async function handleNewChat() {
    const convo = await createConversation("New Conversation");
    setConversations((prev) => [convo, ...prev]);
    setActiveId(convo.id);
    setActiveTitle(convo.title);
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
      setActiveTitle(convo.title);
      convId = convo.id;
    }

    const userMsg = { id: Date.now(), role: "user", content: query, sources: [], streaming: false };
    const assistantId = Date.now() + 1;
    const assistantMsg = {
      id: assistantId, role: "assistant",
      versions: [{ content: "", sources: [] }],
      currentVersion: 0, streaming: true, messageIndex: null,
      compareMode: false, compareContent: "", compareSources: [], compareStreaming: false,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);
    setLoadingStage("retrieving");

    await streamChatQuery(query, convId, {
      onSources: (sources) => {
        setLoadingStage("generating");
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, versions: [{ content: m.versions[0].content, sources }] } : m
        ));
      },
      onToken: (token) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId
            ? { ...m, versions: [{ ...m.versions[0], content: m.versions[0].content + token }] }
            : m
        ));
      },
      onTitle: (title, cid) => {
        setActiveTitle(title);
        setConversations((prev) => prev.map((c) => c.id === cid ? { ...c, title } : c));
      },
      onDone: (msgIndex) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false, messageIndex: msgIndex } : m
        ));
      },
      onError: (err) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) =>
          m.id === assistantId
            ? { ...m, versions: [{ content: `Error: ${err}`, sources: [] }], streaming: false }
            : m
        ));
      },
    });
  }

  async function handleRegenerate(messageId, action, versionIdx) {
    if (action === "prev" || action === "next") {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        if (m.messageIndex != null && activeId) setMessageVersion(activeId, m.messageIndex, versionIdx);
        return { ...m, currentVersion: versionIdx };
      }));
      return;
    }

    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx < 1) return;
    const userMsg = messages[msgIdx - 1];
    const assistantMsg = messages[msgIdx];
    if (!userMsg || userMsg.role !== "user") return;

    const query = userMsg.content;
    const convId = activeId;
    const dbMsgIndex = assistantMsg.messageIndex;
    const newVersionIdx = assistantMsg.versions.length;

    setMessages((prev) => prev.map((m) =>
      m.id === messageId
        ? { ...m, streaming: true, versions: [...m.versions, { content: "", sources: [] }], currentVersion: newVersionIdx }
        : m
    ));
    setIsLoading(true);
    setLoadingStage("retrieving");

    await regenerateMessage(query, convId, dbMsgIndex, {
      onSources: (sources) => {
        setLoadingStage("generating");
        setMessages((prev) => prev.map((m) => {
          if (m.id !== messageId) return m;
          const versions = [...m.versions];
          versions[newVersionIdx] = { ...versions[newVersionIdx], sources };
          return { ...m, versions };
        }));
      },
      onToken: (token) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) => {
          if (m.id !== messageId) return m;
          const versions = [...m.versions];
          versions[newVersionIdx] = { ...versions[newVersionIdx], content: versions[newVersionIdx].content + token };
          return { ...m, versions };
        }));
      },
      onDone: () => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) =>
          m.id === messageId ? { ...m, streaming: false } : m
        ));
      },
      onError: (err) => {
        setIsLoading(false);
        setMessages((prev) => prev.map((m) => {
          if (m.id !== messageId) return m;
          const versions = [...m.versions];
          versions[newVersionIdx] = { content: `Error: ${err}`, sources: [] };
          return { ...m, versions, streaming: false };
        }));
      },
    });
  }

  async function handleCompare(messageId, action) {
    if (action === "close") {
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, compareMode: false, compareContent: "", compareSources: [], compareStreaming: false } : m
      ));
      return;
    }

    const msgIdx = messages.findIndex((m) => m.id === messageId);
    if (msgIdx < 1) return;
    const userMsg = messages[msgIdx - 1];
    const assistantMsg = messages[msgIdx];
    if (!userMsg || userMsg.role !== "user") return;

    setMessages((prev) => prev.map((m) =>
      m.id === messageId
        ? { ...m, compareMode: true, compareContent: "", compareSources: [], compareStreaming: true }
        : m
    ));

    await regenerateMessage(userMsg.content, activeId, assistantMsg.messageIndex, {
      onSources: (sources) => {
        setMessages((prev) => prev.map((m) =>
          m.id === messageId ? { ...m, compareSources: sources } : m
        ));
      },
      onToken: (token) => {
        setMessages((prev) => prev.map((m) =>
          m.id === messageId ? { ...m, compareContent: (m.compareContent || "") + token } : m
        ));
      },
      onDone: () => {
        setMessages((prev) => prev.map((m) =>
          m.id === messageId ? { ...m, compareStreaming: false } : m
        ));
      },
      onError: (err) => {
        setMessages((prev) => prev.map((m) =>
          m.id === messageId ? { ...m, compareContent: `Error: ${err}`, compareStreaming: false } : m
        ));
      },
    });
  }

  function handleKeepVersion(messageId, side) {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;

    if (side === "A") {
      setMessages((prev) => prev.map((m) =>
        m.id === messageId ? { ...m, compareMode: false, compareContent: "", compareSources: [], compareStreaming: false } : m
      ));
    } else {
      const newVersionIdx = msg.versions.length;
      const newVersions = [...msg.versions, { content: msg.compareContent, sources: msg.compareSources }];
      setMessages((prev) => prev.map((m) =>
        m.id === messageId
          ? { ...m, versions: newVersions, currentVersion: newVersionIdx, compareMode: false, compareContent: "", compareSources: [], compareStreaming: false }
          : m
      ));
      if (msg.messageIndex != null && activeId) {
        setMessageVersion(activeId, msg.messageIndex, newVersionIdx);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const waitingForFirstToken =
    isLoading && messages.at(-1)?.role === "assistant" && messages.at(-1)?.versions?.[0]?.content === "";

  return (
    <div className="flex h-screen bg-background text-foreground">
      {showTour && <Tour onClose={() => setShowTour(false)} />}
      <Sidebar conversations={conversations} activeId={activeId} onSelect={handleSelectConversation} onNewChat={handleNewChat} />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h1 className="text-lg font-semibold tracking-tight">RAG Chat</h1>
          <div className="flex items-center gap-2">
            <ExportMenu title={activeTitle} messages={messages} />
            <Button variant="outline" size="sm" onClick={() => setShowTour(true)}>? Tour</Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto flex flex-col gap-4">
            {messages.length === 0 && !isLoading && (
              <p className="text-center text-muted-foreground text-sm mt-20">
                Ask anything about your documents to get started.
              </p>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                activeId={activeId}
                onRegenerate={(action, versionIdx) => handleRegenerate(msg.id, action, versionIdx)}
                onCompare={(id, action) => handleCompare(id, action)}
                onKeepVersion={(id, side) => handleKeepVersion(id, side)}
              />
            ))}
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
