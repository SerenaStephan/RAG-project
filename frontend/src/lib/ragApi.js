const API_BASE = "http://localhost:8000";

// ── Conversations ─────────────────────────────────────────────────────────────

export async function createConversation(title = "New Conversation") {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Failed to create conversation");
  return res.json();
}

export async function fetchConversations() {
  const res = await fetch(`${API_BASE}/conversations`);
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function fetchConversation(id) {
  const res = await fetch(`${API_BASE}/conversations/${id}`);
  if (!res.ok) throw new Error("Failed to fetch conversation");
  return res.json();
}

// ── Streaming chat ────────────────────────────────────────────────────────────

export async function streamChatQuery(query, conversationId, { onToken, onSources, onTitle, onError, onDone }) {
  try {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, conversation_id: conversationId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Server error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(line.slice(6));
          if (json.type === "sources") onSources?.(json.sources);
          else if (json.type === "token") onToken?.(json.token);
          else if (json.type === "title") onTitle?.(json.title, json.conversation_id);
          else if (json.type === "done") onDone?.();
        } catch {
          // ignore malformed events
        }
      }
    }
  } catch (err) {
    onError?.(err.message);
  }
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
