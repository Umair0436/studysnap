from groq import AsyncGroq
from services.rag_service import retrieve_chunks, session_exists
import os
from dotenv import load_dotenv
from groq import GroqError

load_dotenv()
_groq_api_key = os.getenv("GROQ_API_KEY")
client = AsyncGroq(api_key=_groq_api_key) if _groq_api_key else None

async def answer_question(session_id: str, question: str) -> str:
    if not client:
        return "Server configuration error: GROQ_API_KEY is missing."

    if not session_exists(session_id):
        return "Session expired or not found. Please upload the document again."
    
    chunks = retrieve_chunks(session_id, question)
    
    if not chunks:
        context = "No relevant content found in the document."
    else:
        context = "\n\n---\n\n".join(chunks)
    
    prompt = f"""Answer the user's question based ONLY on the document context below.
If the answer is not in the context, say "I couldn't find this in the document."

Document context:
{context}

Question: {question}"""

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024
        )
    except GroqError as e:
        return f"Groq API error: {str(e)}"
    
    return response.choices[0].message.content