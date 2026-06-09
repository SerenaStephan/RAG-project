import weaviate
from weaviate.classes.config import Configure, Property, DataType


def ingest_into_weaviate(embedded_chunks, source_filename):
    # Connect to local Weaviate running through Docker.
    client = weaviate.connect_to_local()

    collection_name = "DocumentChunk"

    # If the collection already exists, delete it so we can recreate it cleanly.
    # This is useful while testing. Later, you may remove this delete step.
    if client.collections.exists(collection_name):
        client.collections.delete(collection_name)

    # Create a Weaviate collection.
    # vectorizer_config=Configure.Vectorizer.none() means:
    # Weaviate will NOT create embeddings by itself.
    # We already created embeddings using SentenceTransformer.
    collection = client.collections.create(
        name=collection_name,
        vectorizer_config=Configure.Vectorizer.none(),
        properties=[
            Property(name="text", data_type=DataType.TEXT),
            Property(name="source", data_type=DataType.TEXT),
            Property(name="page", data_type=DataType.INT),
            Property(name="element", data_type=DataType.INT),
            Property(name="type", data_type=DataType.TEXT),
            Property(name="chunk", data_type=DataType.INT),
        ]
    )

    # Insert chunks in batches instead of one by one.
    # Each object stores:
    # 1. the original chunk text
    # 2. metadata: source file, page number, element type, element number, chunk number
    # 3. the embedding vector

    # Open Weaviate batch mode.
    # This lets us insert many chunks efficiently instead of sending them one by one.
    # dynamic() lets Weaviate automatically choose how to group the objects(it decides the batch size).
    with collection.batch.dynamic() as batch:
        for item in embedded_chunks:
            embedding = item["embedding"]

            # SentenceTransformer returns embeddings as NumPy arrays.
            # Weaviate needs the embedding as a normal Python list.
            # .tolist() converts it from NumPy array to Python list.
            if hasattr(embedding, "tolist"):
                embedding = embedding.tolist()

            batch.add_object(
                properties={
                    "text": item["text"],
                    "source": source_filename,
                    "page": item["page"] if item["page"] is not None else -1,
                    "element": item["element"],
                    "type": item["type"],
                    "chunk": item["chunk"],
                },
                vector=embedding
            )

    print(f"Inserted {len(embedded_chunks)} chunks into Weaviate.")

    client.close()