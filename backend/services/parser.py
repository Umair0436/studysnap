import fitz
import docx
from io import BytesIO

async def extract_text(file):
    filename = (file.filename or "").lower()
    contents = await file.read()
    if not contents:
        raise ValueError("Uploaded file is empty.")
    
    if filename.endswith(".pdf"):
        pdf = fitz.open(stream=contents, filetype="pdf")
        text = ""
        for page in pdf:
            text += page.get_text()
        if not text.strip():
            raise ValueError("Could not extract text from PDF.")
        return text
    
    elif filename.endswith(".docx"):
        doc = docx.Document(BytesIO(contents))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        if not text.strip():
            raise ValueError("Could not extract text from DOCX.")
        return text
    
    elif filename.endswith(".txt"):
        try:
            text = contents.decode("utf-8")
        except UnicodeDecodeError as e:
            raise ValueError("TXT file must be UTF-8 encoded.") from e
        if not text.strip():
            raise ValueError("Uploaded TXT file is empty.")
        return text
    
    else:
        raise ValueError("Unsupported file type. Please upload PDF, DOCX, or TXT.")