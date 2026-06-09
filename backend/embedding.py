from sentence_transformers import SentenceTransformer

def embed_chunks(chunks):
    # Load a local embedding model.
    # This model converts text into numeric vectors that represent meaning.
    # Similar texts should have vectors that are close to each other.
    embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    texts = []

    for chunk in chunks:
        texts.append(chunk["text"])

    # Convert all chunk texts into embeddings.
    # embeddings will be a list/array of numeric vectors.
    #!!normalize_embeddings=True means the vectors are scaled to unit length. This helps when using cosine similarity later.
    embeddings = embedding_model.encode(texts, normalize_embeddings=True)

    embedded_chunks = []

    for chunk, embedding in zip(chunks, embeddings):
        embedded_chunks.append({
            "page": chunk["page"],
            "element": chunk["element"],
            "type": chunk["type"],
            "chunk": chunk["chunk"],
            "text": chunk["text"],
            "embedding": embedding
        })

    return embedded_chunks