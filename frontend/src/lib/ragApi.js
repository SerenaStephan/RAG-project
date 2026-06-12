const API_BASE = "http://localhost:8000";

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

export async function deleteConversation(id) {
  await fetch(`${API_BASE}/conversations/${id}`, { method: "DELETE" });
}

export async function setMessageVersion(conversationId, messageIndex, versionIndex) {
  await fetch(`${API_BASE}/conversations/${conversationId}/messages/${messageIndex}/version`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_index: versionIndex }),
  });
}

export async function submitFeedback({ conversationId, messageIndex, versionIndex, rating, reason }) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      message_index: messageIndex,
      version_index: versionIndex,
      rating,
      reason: reason || null,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit feedback");
  }
  return res.json();
}

async function streamRequest(url, body, { onToken, onSources, onTitle, onDone, onError }) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
          else if (json.type === "done") onDone?.(json.message_index, json.version_index);
        } catch { /* ignore */ }
      }
    }
  } catch (err) {
    onError?.(err.message);
  }
}

export async function streamChatQuery(query, conversationId, callbacks) {
  return streamRequest(
    `${API_BASE}/chat/stream`,
    { query, conversation_id: conversationId },
    callbacks
  );
}

export async function regenerateMessage(query, conversationId, messageIndex, callbacks) {
  return streamRequest(
    `${API_BASE}/chat/regenerate`,
    { query, conversation_id: conversationId, message_index: messageIndex },
    callbacks
  );
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
