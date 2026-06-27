"""
RAG-based in-meeting chatbot route.
POST /api/meeting/{id}/chat  — Ask a question about the meeting transcript
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List

from app.db.database import get_meeting_by_id
from app.rag.vector_store import query_segments
from app.config import settings

router = APIRouter(prefix="/meeting", tags=["chat"])


class ChatRequest(BaseModel):
    question: str


class SourceSegment(BaseModel):
    text: str
    speaker: str
    start: float
    relevance_score: float


class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceSegment]
    question: str


async def _rag_answer(meeting_id: str, question: str, context_segments: list) -> str:
    """Call Gemini with retrieved context to answer the question."""
    import google.generativeai as genai

    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY not set in .env")

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")

    context_text = "\n".join(
        f"- {seg['text']}" for seg in context_segments
    )

    prompt = f"""You are an intelligent meeting assistant with access to a meeting transcript.
A participant is asking a question about what was discussed in the meeting.

RELEVANT TRANSCRIPT EXCERPTS:
{context_text}

PARTICIPANT QUESTION: {question}

Instructions:
- Answer based ONLY on the transcript excerpts provided
- Be concise and direct (2-4 sentences max)
- If the information is not in the transcript, say "This wasn't discussed in the meeting yet."
- Reference specific speakers if helpful (e.g., "According to Speaker 1...")
- Do NOT make up information"""

    response = model.generate_content(
        prompt,
        generation_config=genai.types.GenerationConfig(
            temperature=0.2,
            max_output_tokens=512,
        ),
    )

    return response.text.strip()


@router.post("/{meeting_id}/chat", response_model=ChatResponse)
async def chat_with_meeting(meeting_id: str, body: ChatRequest):
    """
    RAG Q&A endpoint. Retrieves relevant transcript segments from ChromaDB,
    then uses Gemini to answer the user's question with cited context.
    """
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # Retrieve relevant segments
    relevant_segments = query_segments(meeting_id, question, top_k=6)

    if not relevant_segments:
        return ChatResponse(
            answer="No transcript data is available yet. Please wait for the meeting audio to be processed.",
            sources=[],
            question=question,
        )

    # Generate answer
    try:
        answer = await _rag_answer(meeting_id, question, relevant_segments)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")

    sources = [
        SourceSegment(
            text=seg["text"],
            speaker=seg["speaker"],
            start=seg["start"],
            relevance_score=seg["relevance_score"],
        )
        for seg in relevant_segments[:4]  # top 4 sources shown
    ]

    return ChatResponse(
        answer=answer,
        sources=sources,
        question=question,
    )
