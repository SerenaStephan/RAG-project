from langchain_text_splitters import RecursiveCharacterTextSplitter

# we first split by paragraphs then sentences then words if needed
def chunk_pages(parsed_pages):
     # It tries separators in this order: ["\n\n", "\n", " ", ""]
     # "\n\n" = split by paragraphs first
     # "\n" = if a paragraph is too long(longer than chunk_size as set below), split by lines
     # " " = if a line is too long, split by spaces/words
     # "" = if needed, split by individual characters

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150 #means the next chunk repeats around 150 characters from the previous one to avoid losing meaning between chunks
    )

    chunks = []

    for item in parsed_pages:
        page_number = item["page"]
        element_number = item["element"]
        element_type = item["type"]
        page_text = item["text"]

        split_texts = text_splitter.split_text(page_text)

        for chunk_index, chunk_text in enumerate(split_texts, start=1):
            clean_text = chunk_text.strip()

            # Skip very short chunks like repeated headers/titles:
            # Example: "CIS Controls v8"
            if len(clean_text) < 50:
                continue

            # Skip chunks with too few words, even if spacing/newlines make length weird.
            if len(clean_text.split()) < 8:
                continue

            chunks.append({
                "page": page_number,
                "element": element_number,
                "type": element_type,
                "chunk": chunk_index,
                "text": clean_text
            })

    return chunks