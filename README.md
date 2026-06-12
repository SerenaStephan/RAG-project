# RAG Chat

A full-stack AI application that lets users have a conversation with a document. Instead of answering from general knowledge, the system retrieves relevant content from the document first and uses it to generate grounded, cited responses.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |
| Backend | FastAPI (Python) |
| AI Model | Ollama — llama3.2:3b (local) |
| Vector Database | Weaviate |
| Database | MongoDB |
| Reranking | CrossEncoder (ms-marco-MiniLM) |

---

## Features

- **Streaming responses** — answers appear token by token using Server-Sent Events (SSE)
- **Conversation history** — all chats saved to MongoDB and accessible from the sidebar
- **Delete conversation** — removes a conversation from the database instantly
- **Inline citations** — numbered markers linked to source pages with hover tooltips
- **Response regeneration** — generate a different version of any answer
- **Comparison mode** — stream two versions side by side and keep the better one
- **User feedback** — thumbs up/down with mandatory reason for negative feedback
- **Export** — download conversations as Markdown or print to PDF
- **PowerPoint generation** — enter a topic, get a downloadable `.pptx` built from the document
- **Text-to-speech** — read any response aloud using the browser's Speech API
- **Copy to clipboard** — copy clean response text with one click
- **Responsive UI** — works on mobile with a slide-out sidebar drawer

---

## Project Structure

```
rag-complete/
├── frontend/          # React + Vite app
│   └── src/
│       ├── App.jsx        # All UI components
│       └── lib/ragApi.js  # Backend API bridge
├── backend/
│   ├── api.py             # FastAPI endpoints
│   ├── database.py        # MongoDB operations
│   ├── retrieval.py       # Weaviate vector search
│   ├── reranking.py       # CrossEncoder reranking
│   ├── generation.py      # Prompt construction
│   ├── parsing.py         # PDF parsing
│   ├── ingesting.py       # Weaviate ingestion
│   ├── testing.py         # Full ingestion pipeline
│   └── generate_pptx.cjs  # Node.js PPTX builder
```

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Ollama](https://ollama.com/) with `llama3.2:3b` pulled
- [Node.js](https://nodejs.org/)
- [uv](https://github.com/astral-sh/uv) (Python package manager)
- [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)

### 1. Start services

```bash
# MongoDB
docker start rag-mongo

# Weaviate (with persistent volume)
docker run -d -p 8080:8080 -p 50051:50051 -v weaviate_data:/var/lib/weaviate cr.weaviate.io/semitechnologies/weaviate:1.27.0

# Ollama
ollama serve
```

### 2. Start the backend

```bash
cd backend
uv run uvicorn api:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Ingest documents (first time only)

```bash
cd backend
uv run python testing.py
```

This processes the PDF, embeds 743 chunks, and stores them in Weaviate. Takes ~10 minutes on first run.

### 5. Open the app

Go to `http://localhost:5173`

---

## How It Works

1. User sends a question
2. Backend embeds the query and searches Weaviate for the top 10 similar chunks
3. CrossEncoder reranks the results and keeps the top 3
4. A prompt is built with the retrieved context and sent to Ollama
5. The response streams back token by token via SSE
6. The full conversation is saved to MongoDB

---

## Author

Serena Stephan — 2026  
Supervisors: Elias Chedid · Ingy Mysara · Mahmoud Jammoul · Bishoy Mikhael
