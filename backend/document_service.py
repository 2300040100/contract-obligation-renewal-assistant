
from io import BytesIO

from docx import Document
from pypdf import PdfReader


def extract_text(filename: str, content: bytes) -> str:
    """Extract text from a PDF or DOCX document."""

    extension = filename.lower().rsplit(".", 1)[-1]

    if extension == "pdf":
        reader = PdfReader(BytesIO(content))
        text = "\n".join(
            page.extract_text() or ""
            for page in reader.pages
        )

    elif extension == "docx":
        document = Document(BytesIO(content))
        text = "\n".join(
            paragraph.text
            for paragraph in document.paragraphs
        )

    else:
        raise ValueError("Only PDF and DOCX files are supported.")

    text = text.strip()

    if not text:
        raise ValueError(
            "No text found. The document may be empty, "
            "scanned, or image-based."
        )

    return text
