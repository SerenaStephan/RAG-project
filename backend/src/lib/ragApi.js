const API_BASE = "http://localhost:8000";

/**
 * Stream a chat query to the RAG backend via SSE.
 * Calls onToken(token) for each word, onSources(sources) once, onDone() at the end.
 */
export async function streamChatQuery(query, { onToken, onSources, onError, onDone }) {
  try {
    const response = await fetch(`${API_BASE}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
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

      // SSE events are separated by double newlines
      const parts = buffer.split("\n\n");
      buffer = parts.pop(); // keep incomplete last part

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;

        try {
          const json = JSON.parse(line.slice(6)); // strip "data: "

          if (json.type === "sources") onSources?.(json.sources);
          else if (json.type === "token") onToken?.(json.token);
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
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
