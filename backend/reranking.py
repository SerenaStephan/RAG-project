from sentence_transformers import CrossEncoder


def rerank_chunks(query, retrieved_chunks, top_n=3):
    # Load a cross-encoder reranker.
    # A cross-encoder reads the query and the chunk together, then gives a relevance score for that pair.
    reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

    pairs = []

    # Create pairs like:
    # (query, chunk text)
    # The same query is paired with each retrieved chunk.
    for chunk in retrieved_chunks:
        pairs.append((query, chunk["text"]))

    # The reranker gives one score for each (query, chunk) pair.
    # Higher score = more relevant.
    scores = reranker.predict(pairs)

    reranked_chunks = []

    # zip pairs each retrieved chunk with its matching reranker score.
    for chunk, score in zip(retrieved_chunks, scores):
        reranked_chunks.append({
            "text": chunk["text"],
            "source": chunk["source"],
            "page": chunk["page"],
            "element": chunk["element"],
            "type": chunk["type"],
            "chunk": chunk["chunk"],
            "retrieval_distance": chunk["distance"],
            "rerank_score": float(score)
        })

    # Sort from highest reranker score to lowest.
    reranked_chunks.sort(key=lambda item: item["rerank_score"], reverse=True)

    # Keep only the best top_n chunks.
    return reranked_chunks[:top_n]