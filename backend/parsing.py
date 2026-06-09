from langchain_unstructured import UnstructuredLoader  # used to parse PDFs with layout awareness


def parse_pdf(file_path):
    # Unstructured reads the PDF and tries to preserve document structure.
    # Unlike pypdf, it can detect elements such as titles, paragraphs, list items, and tables.
    # It is better for PDFs that contain tables, images, multi-column layouts, or scanned text.
    loader = UnstructuredLoader(
        file_path=str(file_path),
        strategy="hi_res"  # uses layout detection/OCR when needed; slower but more structure-aware
    )

    docs = loader.load()

    parsed_items = []  # list of dictionaries to store the text from each detected document element

    # docs is a list of LangChain Document objects.
    # Each doc represents one extracted element from the PDF, not necessarily one full page.
    for element_number, doc in enumerate(docs, start=1):
        text = doc.page_content

        if text:
            metadata = doc.metadata

            parsed_items.append({
                "page": metadata.get("page_number", None),
                "element": element_number,
                "type": metadata.get("category", "Text"),
                "text": text.strip()
            })

    return parsed_items
