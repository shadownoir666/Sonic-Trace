
"""
Summary generation route — upgraded for SonicTrace v2.

Endpoints:
  GET  /api/meeting/{id}/summary           — General summary (all speakers)
  GET  /api/meeting/{id}/summary/speaker/{speaker} — Per-speaker summary
  GET  /api/meeting/{id}/summary/all       — All summaries (general + each speaker)
"""
import json
import asyncio
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional

from app.db.database import (
    get_meeting_by_id, get_all_segments, get_segments_by_speaker,
    get_distinct_speakers, save_summary, get_summary, get_speaker_profiles,
)
from app.config import settings

router = APIRouter(prefix="/meeting", tags=["summary"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class SummaryResponse(BaseModel):
    meeting_id: str
    summary_type: str           # "general" or speaker name
    overall_summary: str
    key_points: List[str]
    decisions: List[str]
    pending_tasks: List[str]


class AllSummariesResponse(BaseModel):
    meeting_id: str
    general: Optional[SummaryResponse] = None
    per_speaker: List[SummaryResponse] = []


# ── Transcript Builders ────────────────────────────────────────────────────────

def _build_transcript_text(segments: list, speaker_filter: str | None = None) -> str:
    lines = []
    for seg in segments:
        speaker = seg.get("speaker", "Unknown")
        if speaker_filter and speaker != speaker_filter:
            continue
        text = seg.get("text", "").strip()
        start = seg.get("start_time", 0)
        if text:
            lines.append(f"[{speaker} @ {start:.1f}s]: {text}")
    return "\n".join(lines)


def _build_speaker_only_transcript(segments: list, speaker: str) -> str:
    """Build transcript containing only one speaker's utterances."""
    lines = []
    for seg in segments:
        if seg.get("speaker", "") == speaker:
            text = seg.get("text", "").strip()
            start = seg.get("start_time", 0)
            if text:
                lines.append(f"[{start:.1f}s]: {text}")
    return "\n".join(lines)


# ── Gemini Call ────────────────────────────────────────────────────────────────

async def _generate_summary_with_gemini(transcript: str, mode: str = "general", speaker_name: str = "") -> dict:
    """Call Gemini to generate a structured meeting summary."""
    import google.generativeai as genai

    if not settings.gemini_api_key:
        raise ValueError("GEMINI_API_KEY not set in .env")

    genai.configure(api_key=settings.gemini_api_key)

    loop = asyncio.get_event_loop()

    def _call():
        model = genai.GenerativeModel("gemini-2.5-flash")

        if mode == "speaker":
            prompt = f"""You are a professional meeting analyst. Analyze what {speaker_name} specifically said and contributed in this meeting transcript.

{speaker_name}'s UTTERANCES:
{transcript}

Generate a JSON response with EXACTLY this structure:
{{
  "overall_summary": "2-3 sentence summary of {speaker_name}'s contribution and role in this meeting",
  "key_points": ["main point they raised 1", "main point 2", ...],
  "decisions": ["decision they drove or agreed to 1", ...],
  "pending_tasks": ["task assigned to or taken on by them 1", ...]
}}

Rules:
- Focus exclusively on what {speaker_name} said and contributed
- key_points: 2-6 items covering their main contributions
- decisions: decisions they drove, proposed, or explicitly agreed to (empty list if none)
- pending_tasks: action items they mentioned or were assigned (empty list if none)
- Return ONLY valid JSON, no markdown, no extra text"""
        else:
            prompt = f"""You are a professional meeting summarizer. Analyze the following meeting transcript and generate a structured summary.

TRANSCRIPT:
{transcript}

Generate a JSON response with EXACTLY this structure:
{{
  "overall_summary": "2-3 sentence overview of what the meeting was about",
  "key_points": ["bullet point 1", "bullet point 2", ...],
  "decisions": ["decision 1", "decision 2", ...],
  "pending_tasks": ["task 1 (owner if mentioned)", "task 2", ...]
}}

Rules:
- key_points: 3-8 most important discussion points
- decisions: concrete decisions/agreements made (empty list if none)
- pending_tasks: action items / follow-ups mentioned (empty list if none)
- Return ONLY valid JSON, no markdown, no extra text"""

        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,
                max_output_tokens=1024,
            ),
        )
        return response.text.strip()

    raw = await loop.run_in_executor(None, _call)

    # Strip markdown code fences if present
    if raw.startswith("```"):
        parts = raw.split("```")
        raw = parts[1] if len(parts) > 1 else raw
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    return json.loads(raw)


# ── Route: General Summary ─────────────────────────────────────────────────────

@router.get("/{meeting_id}/summary", response_model=SummaryResponse)
async def get_meeting_summary(
    meeting_id: str,
    regenerate: bool = Query(False),
):
    """General meeting summary covering all speakers."""
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if not regenerate:
        cached = await get_summary(meeting_id, summary_type="general")
        if cached:
            return SummaryResponse(
                meeting_id=meeting_id,
                summary_type="general",
                **{k: cached[k] for k in ["overall_summary", "key_points", "decisions", "pending_tasks"]},
            )

    segments = await get_all_segments(meeting_id)
    if not segments:
        raise HTTPException(status_code=422, detail="No transcript data available yet.")

    transcript = _build_transcript_text(segments)
    if len(transcript.strip()) < 50:
        raise HTTPException(status_code=422, detail="Transcript too short to summarize.")

    try:
        summary_data = await _generate_summary_with_gemini(transcript, mode="general")
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {e}")

    await save_summary(meeting_id, summary_data, summary_type="general")

    return SummaryResponse(
        meeting_id=meeting_id,
        summary_type="general",
        overall_summary=summary_data.get("overall_summary", ""),
        key_points=summary_data.get("key_points", []),
        decisions=summary_data.get("decisions", []),
        pending_tasks=summary_data.get("pending_tasks", []),
    )


# ── Route: Per-Speaker Summary ─────────────────────────────────────────────────

@router.get("/{meeting_id}/summary/speaker/{speaker_label}", response_model=SummaryResponse)
async def get_speaker_summary(
    meeting_id: str,
    speaker_label: str,
    regenerate: bool = Query(False),
):
    """Summary of a specific speaker's contributions."""
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Get display name if available
    profiles = await get_speaker_profiles(meeting_id)
    display_name = next(
        (p.get("display_name") or p["speaker_label"] for p in profiles if p["speaker_label"] == speaker_label),
        speaker_label
    )

    summary_key = f"speaker:{speaker_label}"

    if not regenerate:
        cached = await get_summary(meeting_id, summary_type=summary_key)
        if cached:
            return SummaryResponse(
                meeting_id=meeting_id,
                summary_type=display_name,
                **{k: cached[k] for k in ["overall_summary", "key_points", "decisions", "pending_tasks"]},
            )

    all_segments = await get_all_segments(meeting_id)
    speaker_segments = [s for s in all_segments if s.get("speaker", "") == speaker_label or s.get("speaker", "") == display_name]

    if not speaker_segments:
        raise HTTPException(status_code=422, detail=f"No segments found for speaker: {speaker_label}")

    transcript = _build_speaker_only_transcript(speaker_segments, speaker_segments[0].get("speaker", speaker_label))

    if len(transcript.strip()) < 30:
        raise HTTPException(status_code=422, detail=f"{display_name} didn't speak enough to summarize.")

    try:
        summary_data = await _generate_summary_with_gemini(transcript, mode="speaker", speaker_name=display_name)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"LLM returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speaker summary failed: {e}")

    await save_summary(meeting_id, summary_data, summary_type=summary_key)

    return SummaryResponse(
        meeting_id=meeting_id,
        summary_type=display_name,
        overall_summary=summary_data.get("overall_summary", ""),
        key_points=summary_data.get("key_points", []),
        decisions=summary_data.get("decisions", []),
        pending_tasks=summary_data.get("pending_tasks", []),
    )


# ── Route: All Summaries ───────────────────────────────────────────────────────

@router.get("/{meeting_id}/summary/all", response_model=AllSummariesResponse)
async def get_all_summaries(
    meeting_id: str,
    regenerate: bool = Query(False),
):
    """
    Generate/retrieve all summaries: one general + one per speaker.
    Runs all speaker summaries concurrently for speed.
    """
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    speakers = await get_distinct_speakers(meeting_id)
    if not speakers:
        raise HTTPException(status_code=422, detail="No transcript data available yet.")

    # General summary + all speaker summaries in parallel
    async def _safe_speaker_summary(speaker: str):
        try:
            return await get_speaker_summary(meeting_id, speaker, regenerate=regenerate)
        except HTTPException:
            return None

    results = await asyncio.gather(
        get_meeting_summary(meeting_id, regenerate),
        *[_safe_speaker_summary(s) for s in speakers],
        return_exceptions=True,
    )

    general = results[0] if not isinstance(results[0], Exception) else None
    per_speaker = [r for r in results[1:] if r and not isinstance(r, Exception)]

    return AllSummariesResponse(
        meeting_id=meeting_id,
        general=general,
        per_speaker=per_speaker,
    )
