import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from retrieval import retrieve_chunks
from reranking import rerank_chunks
from generation import build_prompt


app = FastAPI(title="RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    query = request.query.strip()

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Step 1 — Retrieve
    retrieved_chunks = retrieve_chunks(query, top_k=10)

    if not retrieved_chunks:
        raise HTTPException(
            status_code=404,
            detail="No relevant chunks found. Make sure documents are ingested."
        )

    # Step 2 — Rerank
    best_chunks = rerank_chunks(query, retrieved_chunks, top_n=3)

    # Step 3 — Build sources metadata (sent as first SSE event)
    sources = [
        {
            "page": chunk["page"],
            "type": chunk["type"],
            "text": chunk["text"][:300],
            "rerank_score": round(chunk["rerank_score"], 4),
        }
        for chunk in best_chunks
    ]

    # Step 4 — Build the prompt
    prompt = build_prompt(query, best_chunks)

    # Step 5 — Stream from Ollama via SSE
    async def event_stream():
        from langchain_ollama import ChatOllama

        # Send sources first so the UI can show chips immediately
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        llm = ChatOllama(model="llama3.2:3b", temperature=0)

        async for chunk in llm.astream(prompt):
            token = chunk.content
            token = token.replace("Computer Incident Society (CIS)", "CIS")
            token = token.replace("Computer Incident Society", "CIS")

            if token:
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
