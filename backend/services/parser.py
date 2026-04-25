import fitz  # PyMuPDF
import docx

async def extract_text(file):
    
    # file ka naam dekho — extension kya hai
    filename = file.filename
    contents = await file.read()
    
    # PDF hai
    if filename.endswith(".pdf"):
        pdf = fitz.open(stream=contents, filetype="pdf")
        text = ""
        for page in pdf:
            text += page.get_text()
        return text
    
    # Word file hai
    elif filename.endswith(".docx"):
        with open("temp.docx", "wb") as f:
            f.write(contents)
        doc = docx.Document("temp.docx")
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text
    
    # Plain text hai
    elif filename.endswith(".txt"):
        return contents.decode("utf-8")
    
    # Koi aur file hai
    else:
        return "Unsupported file type"