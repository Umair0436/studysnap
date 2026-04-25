from fastapi import APIRouter, UploadFile, File, Form
from services.parser import extract_text
from services.ai import generate_quiz
from services.rag_service import store_chunks
import uuid

router = APIRouter(prefix="/quiz")

@router.post("/generate")
async def generate_quiz_route(
    file: UploadFile = File(...),
    q_count: int = Form(...),
    q_type: str = Form(...)
):
    text = await extract_text(file)
    
    # session ID banao aur chunks store karo
    session_id = str(uuid.uuid4())
    store_chunks(session_id, text)
    
    quiz = await generate_quiz(text, q_count, q_type)
    
    # session_id response mein bhejo taake frontend chat mein use kare
    return {"session_id": session_id, "questions": quiz}

@router.post("/upload")
async def upload_document_only(
    file: UploadFile = File(...)
):
    text = await extract_text(file)
    session_id = str(uuid.uuid4())
    store_chunks(session_id, text)
    
    return {"session_id": session_id}
