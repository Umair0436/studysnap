from groq import Groq
import json
import os
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))


async def generate_quiz(text: str, q_count: int, q_type: str):
    import re

    if len(text) > 3000:
        skip = len(text) // 7
        content = text[skip:skip + 5000]
    else:
        content = text

    if q_type == "tf":
        options_instruction = 'options must be exactly: ["A. True", "B. False"]'
    elif q_type == "mcq":
        options_instruction = "options must have exactly 4 choices (A, B, C, D)"
    else:
        options_instruction = "mix of MCQ (4 options) and True/False questions"

    prompt = f"""Read this educational text and create exactly {q_count} quiz questions.
Type: {q_type} — {options_instruction}

STRICT RULES:
- Ask ONLY about concepts, definitions, facts, and ideas from the text
- NEVER ask about page numbers, lecture numbers, course codes, or TOC
- NEVER ask about document metadata or structure
- Questions must test actual understanding

Respond ONLY with a JSON array, no extra text:
[
  {{
    "question": "concept-based question",
    "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
    "correct": "A",
    "explanation": "brief explanation"
  }}
]

TEXT:
{content}"""

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert educational quiz maker. "
                    "You only create questions that test conceptual understanding. "
                    "You never ask about page numbers, indexes, or document structure. "
                    "You always respond with valid JSON only, no extra text."
                )
            },
            {"role": "user", "content": prompt}
        ],
        temperature=0.4  
    )

    raw = response.choices[0].message.content.strip()

    match = re.search(r'\[.*\]', raw, re.DOTALL)
    if not match:
        raise ValueError("JSON array nahi mila AI response mein")

    quiz = json.loads(match.group())
    return quiz