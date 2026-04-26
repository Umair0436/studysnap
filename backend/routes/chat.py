from fastapi import APIRouter, HTTPException
from schemas.chat import ChatRequest, ChatResponse
from services.chat_service import answer_question

router = APIRouter(prefix="/chat")

@router.post("/ask", response_model=ChatResponse)
async def ask_question(body: ChatRequest):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    try:
        answer = await answer_question(body.session_id, body.question)
        return ChatResponse(answer=answer, session_id=body.session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))