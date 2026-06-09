from pathlib import Path  # we use Path instead of writing paths as plain strings everywhere

from parsing import parse_pdf
from chunking import chunk_pages
from embedding import embed_chunks
from ingesting import ingest_into_weaviate
from retrieval import retrieve_chunks
from reranking import rerank_chunks
from generation import generate_answer_with_ollama


pdf_path = Path(
    r"C:\Users\AUB\rag-project\documents\CIS_Controls__v8__Critical_Security_Controls__2023_08.pdf"
)  # r means raw string so windows reads the path correctly

source_filename = pdf_path.name


# STEP 1: PARSING
parsed_items = parse_pdf(pdf_path)

print(f"Parsed items: {len(parsed_items)}")

for item in parsed_items[:5]:
    print(
        f"\n--- PAGE {item['page']} | ELEMENT {item['element']} | TYPE {item['type']} ---"
    )
    print(item["text"][:500])


# STEP 2: CHUNKING
chunks = chunk_pages(parsed_items)

print(f"\nTotal chunks created: {len(chunks)}")

for chunk in chunks[:3]:
    print(
        f"\n--- PAGE {chunk['page']} | ELEMENT {chunk['element']} | "
        f"TYPE {chunk['type']} | CHUNK {chunk['chunk']} ---"
    )
    print(chunk["text"][:500])


# STEP 3: EMBEDDING
embedded_chunks = embed_chunks(chunks)

print(f"\nTotal embedded chunks: {len(embedded_chunks)}")
print(f"Embedding size: {len(embedded_chunks[0]['embedding'])}")


# STEP 4: INGESTION / STORAGE IN WEAVIATE
ingest_into_weaviate(embedded_chunks, source_filename)


# STEP 5: RETRIEVAL
query = "What is the purpose of CIS Controls v8?"

retrieved_chunks = retrieve_chunks(query, top_k=10)

print(f"\nRetrieved chunks: {len(retrieved_chunks)}")


# STEP 6: RERANKING
best_chunks = rerank_chunks(query, retrieved_chunks, top_n=3)

print("\nTop reranked chunks:")

for item in best_chunks:
    print(
        f"\nPage {item['page']} | Element {item['element']} | "
        f"Type {item['type']} | Chunk {item['chunk']} | "
        f"Distance: {item['retrieval_distance']} | "
        f"Rerank score: {item['rerank_score']}"
    )
    print(item["text"][:700])


# STEP 7: GENERATION WITH OLLAMA
final_answer = generate_answer_with_ollama(query, best_chunks)

print("\nFinal answer from Ollama:")
print(final_answer)