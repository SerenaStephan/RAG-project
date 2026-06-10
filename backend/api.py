import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from retrieval import retrieve_chunks
from reranking import rerank_chunks
from generation import build_prompt
from database import (
    create_conversation,
    list_conversations,
    get_conversation,
    append_message,
    update_conversation_title,
)


app = FastAPI(title="RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    query: str
    conversation_id: str


class NewConversationRequest(BaseModel):
    title: str = "New Conversation"


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Conversation endpoints ────────────────────────────────────────────────────

@app.post("/conversations")
async def new_conversation(body: NewConversationRequest):
    convo = await create_conversation(body.title)
    return convo


@app.get("/conversations")
async def get_conversations():
    return await list_conversations()


@app.get("/conversations/{conversation_id}")
async def get_conversation_route(conversation_id: str):
    convo = await get_conversation(conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return convo


# ── Streaming chat ────────────────────────────────────────────────────────────

@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    query = request.query.strip()
    conversation_id = request.conversation_id

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    # Verify conversation exists
    convo = await get_conversation(conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    # Save user message immediately
    await append_message(conversation_id, "user", query, [])

    # Retrieve → rerank
    retrieved_chunks = retrieve_chunks(query, top_k=10)
    if not retrieved_chunks:
        raise HTTPException(status_code=404, detail="No relevant chunks found.")

    best_chunks = rerank_chunks(query, retrieved_chunks, top_n=3)

    sources = [
        {
            "page": chunk["page"],
            "type": chunk["type"],
            "text": chunk["text"][:300],
            "rerank_score": round(chunk["rerank_score"], 4),
        }
        for chunk in best_chunks
    ]

    prompt = build_prompt(query, best_chunks)

    # Auto-generate title from first question if still default
    is_first_message = len(convo.get("messages", [])) == 0
    if is_first_message:
        title = await generate_title(query)
        await update_conversation_title(conversation_id, title)

    async def event_stream():
        from langchain_ollama import ChatOllama

        full_answer = ""

        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # If title was just generated, send it to frontend
        if is_first_message:
            title = await generate_title(query)
            yield f"data: {json.dumps({'type': 'title', 'title': title, 'conversation_id': conversation_id})}\n\n"

        llm = ChatOllama(model="llama3.2:3b", temperature=0)

        async for chunk in llm.astream(prompt):
            token = chunk.content
            token = token.replace("Computer Incident Society (CIS)", "CIS")
            token = token.replace("Computer Incident Society", "CIS")

            if token:
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        # Save assistant message after full generation
        await append_message(conversation_id, "assistant", full_answer, sources)

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Title generation ──────────────────────────────────────────────────────────


async def generate_title(query: str) -> str:
    from langchain_ollama import ChatOllama

    llm = ChatOllama(model="llama3.2:3b", temperature=0)
    prompt = f"""Create a short 4-6 word title summarizing this question about cybersecurity.
CIS refers to the Center for Internet Security, not biology.
Return ONLY the title, no quotes, no explanation.

Question: {query}

Title:"""
    response = await llm.ainvoke(prompt)
    return response.content.strip()[:60]
