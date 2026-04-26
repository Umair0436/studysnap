from fastapi import APIRouter, UploadFile, File, Form, HTTPException
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
    try:
        normalized_q_type = (q_type or "").strip().lower()
        if q_count < 1 or q_count > 30:
            raise HTTPException(status_code=400, detail="q_count must be between 1 and 30")
        if normalized_q_type not in {"mcq", "tf", "mixed"}:
            raise HTTPException(status_code=400, detail="q_type must be one of: mcq, tf, mixed")

        text = await extract_text(file)
        
        session_id = str(uuid.uuid4())
        store_chunks(session_id, text)
        
        quiz = await generate_quiz(text, q_count, normalized_q_type)
        
        return {"session_id": session_id, "questions": quiz}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_document_only(
    file: UploadFile = File(...)
):
    try:
        text = await extract_text(file)
        session_id = str(uuid.uuid4())
        store_chunks(session_id, text)
        
        return {"session_id": session_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
