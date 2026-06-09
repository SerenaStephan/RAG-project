from pathlib import Path
from pypdf import PdfReader
import re

pdf_path = Path(
    r"C:\Users\AUB\rag-project\documents\CIS_Controls__v8__Critical_Security_Controls__2023_08.pdf"
)

output_path = Path("docs/cis_controls_clean.txt")
output_path.parent.mkdir(exist_ok=True)

reader = PdfReader(pdf_path)


def clean_text(text):
    # Replace common problematic characters
    text = text.replace("®", "")
    text = text.replace("™", "")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = text.replace("“", '"')
    text = text.replace("”", '"')
    text = text.replace("‘", "'")
    text = text.replace("’", "'")

    # Remove remaining non-ASCII characters that can break Windows text loading
    text = text.encode("ascii", errors="ignore").decode("ascii")

    # Clean extra spaces
    text = re.sub(r"\s+", " ", text)

    return text.strip()


with open(output_path, "w", encoding="utf-8") as f:
    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text()

        if text:
            cleaned = clean_text(text)

            if cleaned:
                f.write(f"\n\nPAGE {page_number}\n")
                f.write(cleaned)

print(f"Saved clean text to {output_path}")
print(f"Total pages: {len(reader.pages)}")