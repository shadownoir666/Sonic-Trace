import sys
import os

# Ensure backend directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.diarization.silero_impl import SileroDiarizer

def test_diarizer(audio_path: str):
    if not os.path.exists(audio_path):
        print(f"Error: Audio file not found at '{audio_path}'")
        sys.exit(1)

    print(f"Loading diarizer...")
    diarizer = SileroDiarizer()
    
    print(f"Running diarization on '{audio_path}'...")
    try:
        segments, dendrograms = diarizer.diarize(audio_path)
        print("\n--- Diarization Results ---")
        if not segments:
            print("No segments found.")
        for seg in segments:
            print(f"Speaker: {seg.get('speaker', 'Unknown')} | Time: {seg.get('start', 0):.2f}s - {seg.get('end', 0):.2f}s")
        print("---------------------------")
    except Exception as e:
        print(f"Diarization failed: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_diarizer.py <path_to_audio_file.wav>")
        sys.exit(1)
    
    test_diarizer(sys.argv[1])
