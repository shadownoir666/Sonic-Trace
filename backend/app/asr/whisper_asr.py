
"""
WhisperASR — Upgraded to use faster-whisper (CTranslate2 backend).
  • 4-10x faster than openai-whisper on CPU/GPU
  • int8 quantization on CPU for further speedup
  • Keeps same interface: add_transcripts(audio_path, segments) → segments
"""
from typing import List, Dict

from app.config import settings


class WhisperASR:

    def __init__(self):
        self.device = settings.device
        model_size = settings.whisper_model_size

        try:
            from faster_whisper import WhisperModel

            # int8 on CPU for speed, float16 on GPU
            compute_type = "float16" if self.device == "cuda" else "int8"

            self.model = WhisperModel(
                model_size,
                device=self.device,
                compute_type=compute_type,
                cpu_threads=4,
                num_workers=2,
            )
            self._backend = "faster_whisper"
            print(f"[ASR] Using faster-whisper ({model_size}, {self.device}, {compute_type})", flush=True)

        except ImportError:
            # Fallback to openai-whisper if faster-whisper not installed
            import whisper
            self.model = whisper.load_model(model_size, device=self.device)
            self._backend = "openai_whisper"
            print(f"[ASR] faster-whisper not found, using openai-whisper ({model_size})", flush=True)

    @staticmethod
    def _overlap_duration(s1: float, e1: float, s2: float, e2: float) -> float:
        return max(0.0, min(e1, e2) - max(s1, s2))

    def _transcribe_faster_whisper(self, audio_path: str) -> List[Dict]:
        """Transcribe using faster-whisper, returns list of {start, end, text}."""
        segments, _ = self.model.transcribe(
            audio_path,
            language=None,        # auto-detect
            beam_size=3,          # reduced from 5 for speed
            vad_filter=True,      # built-in VAD filter skips silence
            vad_parameters=dict(min_silence_duration_ms=500),
            word_timestamps=False,
        )
        return [
            {"start": float(seg.start), "end": float(seg.end), "text": seg.text.strip()}
            for seg in segments
            if seg.text.strip()
        ]

    def _transcribe_openai_whisper(self, audio_path: str) -> List[Dict]:
        """Transcribe using openai-whisper, returns list of {start, end, text}."""
        result = self.model.transcribe(
            audio_path,
            language=None,
            fp16=(self.device == "cuda"),
        )
        return [
            {"start": float(s["start"]), "end": float(s["end"]), "text": s.get("text", "").strip()}
            for s in (result.get("segments") or [])
            if s.get("text", "").strip()
        ]

    def add_transcripts(self, audio_path: str, segments: List[Dict]) -> List[Dict]:
        """
        Given diarized segments, transcribe the full audio and align text to segments.
        Each segment gets a 'text' field filled with the best-matching ASR text.
        """
        for seg in segments:
            seg["text"] = ""

        try:
            if self._backend == "faster_whisper":
                asr_segments = self._transcribe_faster_whisper(audio_path)
            else:
                asr_segments = self._transcribe_openai_whisper(audio_path)
        except Exception as e:
            print(f"[ASR] Transcription error: {e}", flush=True)
            return segments

        # Align ASR text to diarization segments by maximum overlap
        for a_seg in asr_segments:
            a_start = a_seg["start"]
            a_end = a_seg["end"]
            text = a_seg["text"]
            if not text:
                continue

            best_overlap = 0.0
            best_match = None

            for d_seg in segments:
                overlap = self._overlap_duration(d_seg["start"], d_seg["end"], a_start, a_end)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_match = d_seg

            if best_overlap > 0.1 and best_match is not None:
                current = best_match.get("text", "")
                best_match["text"] = f"{current} {text}".strip() if current else text

        return segments
