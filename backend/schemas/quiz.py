from pydantic import BaseModel
from typing import List

# ek question ka structure
class Question(BaseModel):
    question: str
    options: List[str]
    correct: str
    explanation: str

# AI ki puri response ka structure
class QuizResponse(BaseModel):
    questions: List[Question]