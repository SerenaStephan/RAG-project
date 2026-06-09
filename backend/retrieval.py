import weaviate
from sentence_transformers import SentenceTransformer
from weaviate.classes.query import MetadataQuery

def retrieve_chunks(query, top_k=10):
    # Connect to local Weaviate.
    client = weaviate.connect_to_local()

    # Use the same collection where we stored the chunks.
    collection = client.collections.get("DocumentChunk")

    # Use the same embedding model used during ingestion.
    # This is important because the query vector and chunk vectors must live in the same semantic vector space.
    embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    # Convert the user query into an embedding vector.
    query_embedding = embedding_model.encode(query, normalize_embeddings=True)

    # Weaviate expects a normal Python list, not a NumPy array.
    if hasattr(query_embedding, "tolist"):
        query_embedding = query_embedding.tolist()

    # Search Weaviate using the query vector.
    # near_vector finds chunks whose stored vectors are closest to the query vector.
    #...MetadataQuery(distance=True) tells Weaviate to also return the distance score, so we can access it later using obj.metadata.distance.
    response = collection.query.near_vector(
        near_vector=query_embedding,
        limit=top_k,
        return_metadata=MetadataQuery(distance=True)
    )

    retrieved_chunks = []

    # response is the full Weaviate search response.
    # response.objects contains the actual retrieved chunks/objects.
    # Each obj has:
    # - obj.properties: the values we stored earlier
    # - obj.metadata: extra values Weaviate computed during search, like distance
    for obj in response.objects:
        retrieved_chunks.append({
            "text": obj.properties["text"],
            "source": obj.properties["source"],
            "page": obj.properties["page"],
            "element": obj.properties["element"],
            "type": obj.properties["type"],
            "chunk": obj.properties["chunk"],
            "distance": obj.metadata.distance
        })

    client.close()

    return retrieved_chunks