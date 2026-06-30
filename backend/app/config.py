from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    hf_token: str | None = None
    gemini_api_key: str | None = None
    whisper_model_size: str = "medium"
    device: str = "cuda"
    audio_dir: str = "data/audio"
    sonic_db_path: str = "data/sonic_trace.db"
    chroma_dir: str = "data/chroma_db"
    qdrant_dir: str = "data/qdrant_db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

settings = Settings()

import torch
if settings.device == "cuda" and not torch.cuda.is_available():
    print("Warning: Torch not compiled with CUDA enabled. Falling back to CPU.", flush=True)
    settings.device = "cpu"

import os
os.environ["SONIC_DB_PATH"] = settings.sonic_db_path
os.environ["CHROMA_DIR"] = settings.chroma_dir
os.environ["QDRANT_DIR"] = settings.qdrant_dir
