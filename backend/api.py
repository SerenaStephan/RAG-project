import json
import random
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
    add_message_version,
    set_current_version,
    update_conversation_title,
    save_feedback,
)


app = FastAPI(title="RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    query: str
    conversation_id: str


class RegenerateRequest(BaseModel):
    query: str
    conversation_id: str
    message_index: int


class NewConversationRequest(BaseModel):
    title: str = "New Conversation"


class SetVersionRequest(BaseModel):
    version_index: int


class FeedbackRequest(BaseModel):
    conversation_id: str
    message_index: int
    version_index: int
    rating: str         # "up" or "down"
    reason: str | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/conversations")
async def new_conversation(body: NewConversationRequest):
    return await create_conversation(body.title)


@app.get("/conversations")
async def get_conversations():
    return await list_conversations()


@app.get("/conversations/{conversation_id}")
async def get_conversation_route(conversation_id: str):
    convo = await get_conversation(conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return convo


@app.post("/conversations/{conversation_id}/messages/{message_index}/version")
async def set_version(conversation_id: str, message_index: int, body: SetVersionRequest):
    await set_current_version(conversation_id, message_index, body.version_index)
    return {"ok": True}


@app.post("/feedback")
async def submit_feedback(body: FeedbackRequest):
    if body.rating == "down" and not body.reason:
        raise HTTPException(status_code=400, detail="Reason is required for negative feedback.")
    result = await save_feedback(
        body.conversation_id,
        body.message_index,
        body.version_index,
        body.rating,
        body.reason,
    )
    return result


@app.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    query = request.query.strip()
    conversation_id = request.conversation_id

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    convo = await get_conversation(conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    await append_message(conversation_id, "user", query, [])

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
    is_first_message = len(convo.get("messages", [])) == 0

    async def event_stream():
        from langchain_ollama import ChatOllama
        full_answer = ""

        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        if is_first_message:
            title = await generate_title(query)
            await update_conversation_title(conversation_id, title)
            yield f"data: {json.dumps({'type': 'title', 'title': title, 'conversation_id': conversation_id})}\n\n"

        llm = ChatOllama(model="llama3.2:3b", temperature=0.7)
        async for chunk in llm.astream(prompt):
            token = chunk.content
            token = token.replace("Computer Incident Society (CIS)", "CIS")
            token = token.replace("Computer Incident Society", "CIS")
            if token:
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        await append_message(conversation_id, "assistant", full_answer, sources)
        convo_updated = await get_conversation(conversation_id)
        msg_index = len(convo_updated.get("messages", [])) - 1
        yield f"data: {json.dumps({'type': 'done', 'message_index': msg_index})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat/regenerate")
async def chat_regenerate(request: RegenerateRequest):
    query = request.query.strip()
    conversation_id = request.conversation_id
    message_index = request.message_index

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    convo = await get_conversation(conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    retrieved_chunks = retrieve_chunks(query, top_k=10)
    if not retrieved_chunks:
        raise HTTPException(status_code=404, detail="No relevant chunks found.")

    top_chunks = rerank_chunks(query, retrieved_chunks, top_n=5)
    best_chunks = random.sample(top_chunks, min(3, len(top_chunks)))

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
    prompt += "\n\nNote: Provide a fresh perspective with different phrasing and structure from any previous answer."

    async def event_stream():
        from langchain_ollama import ChatOllama
        full_answer = ""

        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        llm = ChatOllama(model="llama3.2:3b", temperature=0.8)
        async for chunk in llm.astream(prompt):
            token = chunk.content
            token = token.replace("Computer Incident Society (CIS)", "CIS")
            token = token.replace("Computer Incident Society", "CIS")
            if token:
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

        result = await add_message_version(conversation_id, message_index, full_answer, sources)
        yield f"data: {json.dumps({'type': 'done', 'version_index': result.get('version_index', 0)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
