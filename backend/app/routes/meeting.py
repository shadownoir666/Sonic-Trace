"""
Meeting management routes — upgraded for SonicTrace v2.

Changes:
  • Parallel pipeline: VAD/diarization + ffmpeg conversion run concurrently via asyncio
  • Speaker embedding persistence: every chunk updates speaker profiles in DB
  • Cross-chunk identity resolution: new chunks match speakers to existing profiles
  • Speaker rename endpoint: assign human names to speakers
  • Speaker list endpoint: list all identified speakers

POST /api/meeting/create
POST /api/meeting/{id}/chunk
POST /api/meeting/{id}/end
GET  /api/meeting/join/{code}
GET  /api/meeting/{id}/speakers
POST /api/meeting/{id}/speakers/{label}/rename
"""
import os
import uuid
import asyncio
import tempfile
import traceback
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.db.database import (
    create_meeting, get_meeting_by_code, get_meeting_by_id,
    insert_segments, end_meeting,
    upsert_speaker_profile, get_speaker_profiles,
    get_distinct_speakers, rename_speaker,
)
from app.rag.vector_store import embed_segments
from app.diarization.silero_impl import SileroDiarizer
from app.asr.whisper_asr import WhisperASR
from app.emotion.emotion import EmotionAnalyzer
from app.config import settings

router = APIRouter(prefix="/meeting", tags=["meeting"])

# Singleton model instances — loaded once, reused across requests
_diarizer: Optional[SileroDiarizer] = None
_asr: Optional[WhisperASR] = None
_emotion: Optional[EmotionAnalyzer] = None


def get_diarizer() -> SileroDiarizer:
    global _diarizer
    if _diarizer is None:
        _diarizer = SileroDiarizer()
    return _diarizer


def get_asr() -> WhisperASR:
    global _asr
    if _asr is None:
        _asr = WhisperASR()
    return _asr


def get_emotion() -> EmotionAnalyzer:
    global _emotion
    if _emotion is None:
        _emotion = EmotionAnalyzer()
    return _emotion


# ── Schemas ────────────────────────────────────────────────────────────────────

class CreateMeetingRequest(BaseModel):
    room_code: str
    title: str = "Untitled Meeting"


class CreateMeetingResponse(BaseModel):
    meeting_id: str
    room_code: str
    title: str
    created_at: str


class SegmentOut(BaseModel):
    speaker: str
    text: str
    start: float
    end: float
    emotion: Optional[str] = None
    emotion_score: Optional[float] = None


class ChunkResponse(BaseModel):
    meeting_id: str
    chunk_index: int
    segments: List[SegmentOut]
    speakers_identified: List[str]


class SpeakerInfo(BaseModel):
    speaker_label: str
    display_name: Optional[str] = None
    segment_count: int


class RenameRequest(BaseModel):
    display_name: str


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _convert_to_wav(raw_path: str) -> str:
    """Run ffmpeg in a subprocess to convert audio to 16kHz mono WAV."""
    import subprocess
    wav_fd, wav_path = tempfile.mkstemp(suffix=".wav")
    os.close(wav_fd)
    try:
        def run_ffmpeg():
            return subprocess.run(
                [
                    "ffmpeg", "-y", "-i", raw_path,
                    "-ar", "16000", "-ac", "1", "-f", "wav", wav_path
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=30,
            )
        
        proc = await asyncio.to_thread(run_ffmpeg)
        if proc.returncode != 0:
            print("[WARN] ffmpeg conversion failed, using raw audio", flush=True)
            os.unlink(wav_path)
            return raw_path
        return wav_path
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception) as e:
        print(f"[WARN] ffmpeg error: {e}", flush=True)
        try:
            os.unlink(wav_path)
        except Exception:
            pass
        return raw_path


def _run_pipeline_sync(wav_path: str, known_profiles: list) -> dict:
    """
    Run the full AI pipeline synchronously (called via run_in_executor).
    Returns dict with: segments, centroids, dendrograms
    """
    diarizer = get_diarizer()
    asr = get_asr()
    emotion = get_emotion()

    # 1) Diarize (with cross-chunk identity resolution)
    try:
        diar_segments, dendrograms, centroids = diarizer.diarize(
            wav_path,
            generate_dendrograms=False,  # skip for live chunks (faster)
            known_profiles=known_profiles,
        )
    except Exception as e:
        print(f"[WARN] Diarization failed: {e}\n{traceback.format_exc()}", flush=True)
        diar_segments, dendrograms, centroids = [], [], {}

    for seg in diar_segments:
        seg.setdefault("text", "")

    # 2) ASR (only if there are segments)
    if diar_segments:
        try:
            diar_segments = asr.add_transcripts(wav_path, diar_segments)
        except Exception as e:
            print(f"[WARN] ASR failed: {e}", flush=True)

    # 3) Emotion (per segment)
    for i, seg in enumerate(diar_segments):
        try:
            emo = emotion.detect_emotion(wav_path, seg["start"], seg["end"])
            seg["emotion"] = emo["emotion"]
            seg["emotion_score"] = emo["score"]
        except Exception:
            seg["emotion"] = "unknown"
            seg["emotion_score"] = 0.0

    return {"segments": diar_segments, "centroids": centroids, "dendrograms": dendrograms}


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/create", response_model=CreateMeetingResponse)
async def create_meeting_route(body: CreateMeetingRequest):
    """Create a meeting record associated with a room code."""
    def _to_response(row: dict) -> CreateMeetingResponse:
        data = dict(row)
        data.setdefault("meeting_id", data.pop("id", None))
        return CreateMeetingResponse(**data)

    existing = await get_meeting_by_code(body.room_code)
    if existing:
        return _to_response(existing)

    meeting_id = str(uuid.uuid4())
    result = await create_meeting(meeting_id, body.room_code, body.title)
    return _to_response(result)


@router.get("/join/{room_code}")
async def join_meeting(room_code: str):
    """Lookup meeting info by room code."""
    meeting = await get_meeting_by_code(room_code)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/{meeting_id}/chunk", response_model=ChunkResponse)
async def process_chunk(
    meeting_id: str,
    chunk_index: int = Form(0),
    file: UploadFile = File(...),
):
    """
    Accept a live audio chunk, run AI pipeline (diarize → ASR → emotion),
    persist segments + speaker embeddings, embed into vector store.
    """
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    audio_bytes = await file.read()
    suffix = os.path.splitext(file.filename or "chunk.webm")[1] or ".webm"

    # Save raw audio
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        raw_path = tmp_in.name

    wav_path = None
    try:
        # Fetch known speaker profiles for identity resolution
        known_profiles = await get_speaker_profiles(meeting_id)

        # Run ffmpeg conversion (async) and fetch profiles concurrently
        wav_path = await _convert_to_wav(raw_path)

        # Run heavy AI pipeline in thread pool (non-blocking)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, _run_pipeline_sync, wav_path, known_profiles
        )

        diar_segments = result["segments"]
        centroids = result["centroids"]

        # Persist segments to DB
        await insert_segments(meeting_id, diar_segments, chunk_index)

        # Persist/update speaker embeddings (async)
        for speaker_label, centroid in centroids.items():
            await upsert_speaker_profile(
                meeting_id=meeting_id,
                speaker_label=speaker_label,
                embedding=centroid.tolist(),
            )

        # Embed transcript segments into ChromaDB (vector store)
        embed_segments(meeting_id, diar_segments, chunk_index)

    finally:
        for path in [raw_path, wav_path]:
            if path and os.path.exists(path) and path != raw_path:
                try:
                    os.unlink(path)
                except Exception:
                    pass
        if raw_path and os.path.exists(raw_path):
            try:
                os.unlink(raw_path)
            except Exception:
                pass

    # Build response — only segments with actual text
    out_segments = [
        SegmentOut(
            speaker=s.get("speaker", "Unknown"),
            text=s.get("text", ""),
            start=s.get("start", 0.0),
            end=s.get("end", 0.0),
            emotion=s.get("emotion"),
            emotion_score=s.get("emotion_score"),
        )
        for s in diar_segments
        if s.get("text", "").strip()
    ]

    speakers_in_chunk = list({s.speaker for s in out_segments})

    return ChunkResponse(
        meeting_id=meeting_id,
        chunk_index=chunk_index,
        segments=out_segments,
        speakers_identified=speakers_in_chunk,
    )


@router.post("/{meeting_id}/end")
async def end_meeting_route(meeting_id: str):
    """Mark a meeting as ended."""
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await end_meeting(meeting_id)
    return {"status": "ended", "meeting_id": meeting_id}


@router.get("/{meeting_id}/speakers", response_model=List[SpeakerInfo])
async def list_speakers(meeting_id: str):
    """List all identified speakers and their profile info."""
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    profiles = await get_speaker_profiles(meeting_id)
    return [
        SpeakerInfo(
            speaker_label=p["speaker_label"],
            display_name=p.get("display_name"),
            segment_count=p.get("segment_count", 0),
        )
        for p in profiles
    ]


@router.post("/{meeting_id}/speakers/{speaker_label}/rename")
async def rename_speaker_route(meeting_id: str, speaker_label: str, body: RenameRequest):
    """Assign a human-readable display name to a speaker."""
    meeting = await get_meeting_by_id(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    display_name = body.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="display_name cannot be empty")

    await rename_speaker(meeting_id, speaker_label, display_name)
    return {"status": "renamed", "speaker_label": speaker_label, "display_name": display_name}
