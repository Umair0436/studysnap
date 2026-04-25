import re
from typing import List, Tuple

# In-memory store: { session_id: [chunk1, chunk2, ...] }
_doc_store: dict[str, List[str]] = {}

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> List[str]:
    words = text.split()
    chunks, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks

def store_chunks(session_id: str, text: str):
    chunks = chunk_text(text)
    _doc_store[session_id] = chunks

def retrieve_chunks(session_id: str, query: str, top_k: int = 4) -> List[str]:
    chunks = _doc_store.get(session_id, [])
    if not chunks:
        return []
    
    query_words = set(re.findall(r'\w+', query.lower()))
    
    scored = []
    for chunk in chunks:
        chunk_words = set(re.findall(r'\w+', chunk.lower()))
        score = len(query_words & chunk_words)
        scored.append((score, chunk))
    
    scored.sort(key=lambda x: x[0], reverse=True)
    return [chunk for _, chunk in scored[:top_k] if _ > 0]

def session_exists(session_id: str) -> bool:
    return session_id in _doc_store