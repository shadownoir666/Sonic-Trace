import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.diarization.silero_impl import SileroDiarizer
from app.asr.whisper_asr import WhisperASR

def test_pipeline(audio_path: str):
    if not os.path.exists(audio_path):
        print(f"Error: Audio file not found at '{audio_path}'")
        sys.exit(1)

    print(f"Loading diarizer...")
    diarizer = SileroDiarizer()
    
    print(f"Loading ASR...")
    asr = WhisperASR()
    
    print(f"Running pipeline on '{audio_path}'...")
    try:
        segments, _ = diarizer.diarize(audio_path)
        print("Diarization complete.")
        
        segments_with_text = asr.add_transcripts(audio_path, segments)
        
        print("\n--- Final Results (Transcription + Diarization) ---")
        if not segments_with_text:
            print("No segments found.")
        for seg in segments_with_text:
            print(f"Speaker: {seg.get('speaker', 'Unknown')} | Time: {seg.get('start', 0):.2f}s - {seg.get('end', 0):.2f}s | Text: {seg.get('text', '')}")
        print("---------------------------------------------------")
    except Exception as e:
        print(f"Pipeline failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_pipeline.py <path_to_audio_file>")
        sys.exit(1)
    
    test_pipeline(sys.argv[1])
