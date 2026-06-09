from retrieval import retrieve_chunks
from reranking import rerank_chunks
from generation import generate_answer_with_ollama


query = "What are CIS Controls?"

print("\nUser question:")
print(query)

retrieved_chunks = retrieve_chunks(query, top_k=10)

best_chunks = rerank_chunks(query, retrieved_chunks, top_n=3)

print("\nTop reranked chunks:")
for i, chunk in enumerate(best_chunks, start=1):
    print(f"\n--- Chunk {i} ---")
    print(
        f"Page: {chunk['page']} | Element: {chunk['element']} | "
        f"Type: {chunk['type']} | Rerank score: {chunk['rerank_score']}"
    )
    print(chunk["text"][:700])

final_answer = generate_answer_with_ollama(query, best_chunks)

print("\nFinal answer:")
print(final_answer)