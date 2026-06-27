from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil

# --- FFmpeg Fix for Windows Winget Install (if not founded ,try to found it manually)---
if not shutil.which("ffmpeg"):
    user_home = os.path.expanduser("~")
    possible_paths = [
        os.path.join(user_home, r"AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin"),
        os.path.join(user_home, r"AppData\Local\Microsoft\WinGet\Links")
    ]
    for p in possible_paths:
        if os.path.exists(os.path.join(p, "ffmpeg.exe")):
            print(f"Found FFmpeg at {p}. Adding to PATH...", flush=True)
            os.environ["PATH"] += os.pathsep + p
            break
# ---------------------------------------------

from contextlib import asynccontextmanager
from app.db.database import init_db
from app.routes import audio, health, media
from app.routes import meeting, summary, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialise SQLite tables
    await init_db()
    yield
    #everything before yield run once when server starts
    # Shutdown (cleanup if needed)


app = FastAPI(title="SonicTrace", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing routes
app.include_router(health.router, prefix="/api")
app.include_router(audio.router, prefix="/api")
app.include_router(media.router, prefix="/api")

# New meeting intelligence routes
app.include_router(meeting.router, prefix="/api")
app.include_router(summary.router, prefix="/api")
app.include_router(chat.router, prefix="/api")