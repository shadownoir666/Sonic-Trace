# SonicTrace — Meeting Intelligence Platform

> Real-time video calls with AI-powered speaker diarization, live transcripts, RAG chatbot, and automatic meeting summarization.

## Architecture

```
React Frontend (Vite, Port 5173)
       ↕ REST + Socket.IO
Express/Node Server (Port 3001)
       ↕ REST
FastAPI/Uvicorn Python Backend (Port 8000)
  ├── Silero VAD + Resemblyzer (Diarization)
  ├── OpenAI Whisper (ASR)
  ├── HuggingFace Emotion (Analysis)
  ├── Qdrant (RAG Vector Store)
  ├── SQLite / aiosqlite (Meeting DB)
  └── Gemini 1.5 (Summary + Chat)
```

## Features

- 🎥 **Video Call Rooms** — WebRTC mesh with 6-char room codes
- 🎙️ **Real-time Diarization** — Speaker identification every 15 seconds
- 📝 **Live Transcript** — Speaker-labeled, color-coded, auto-scrolling
- 🤖 **RAG Chatbot** — Ask questions about what was discussed (answers with transcript citations)
- 📊 **Auto Summary** — Overall summary, key points, decisions, pending tasks
- 😊 **Emotion Analysis** — Emotional tone per speaker segment

## Quick Start

### 1. Python Backend

```powershell
cd backend

# Create .env from example
copy .env.example .env
# Edit .env and add your GROQ_API_KEY

# Activate virtualenv
.\myenv\Scripts\activate

# Install new dependencies
pip install aiosqlite qdrant-client sentence-transformers scipy matplotlib

# Start the server
uvicorn app.main:app --reload --port 8000
```

### 2. Node/Express Server

```powershell
cd node-server

# Create .env (optional, defaults work)
copy .env.example .env

# Start server
npm start
# or for dev with auto-reload:
npm run dev
```

### 3. React Frontend

```powershell
cd frontend

# Create .env (optional, defaults work)
copy .env.example .env

# Start dev server
npm run dev
```

Then open http://localhost:5173

## Testing

You can run individual integration and unit tests for the Python backend modules. Make sure your virtual environment is active (`.\myenv\Scripts\activate`) and you are in the `backend/` directory:

* **Verify Qdrant Vector Store Updates**:
  ```powershell
  python test_qdrant_update.py
  ```
* **Verify Speaker Diarization**:
  ```powershell
  python test_diarizer.py <path_to_audio_file.wav>
  ```
* **Verify Full Diarization + Transcription Pipeline**:
  ```powershell
  python test_pipeline.py <path_to_audio_file.wav>
  ```

## Usage

1. Open the app → Enter your name → **Create Meeting** (gets a room code like `ABC123`)
2. Share the room code with other participants → they **Join Meeting**
3. Meeting starts automatically with video/audio
4. **Live Transcript** panel on the right updates every 15 seconds
5. Click **Ask AI** to open the RAG chatbot and ask questions about the meeting
6. Click **Summary** or **End** to generate the meeting summary

## Environment Variables

### `backend/.env`
| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ | — | Gemini API key for Summaries and Chat |
| `HF_TOKEN` | Optional | — | HuggingFace token |
| `WHISPER_MODEL_SIZE` | Optional | `medium` | Whisper model size |
| `DEVICE` | Optional | `cuda` | `cuda` or `cpu` |
| `SONIC_DB_PATH` | Optional | `data/sonic_trace.db` | SQLite DB path |
| `QDRANT_DIR` | Optional | `data/qdrant_db` | Qdrant database storage path |

### `node-server/.env`
| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Optional | `3001` | Node server port |
| `PYTHON_URL` | Optional | `http://127.0.0.1:8000` | Python backend URL |

### `frontend/.env`
| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_NODE_URL` | Optional | `http://localhost:3001` | Node server URL |

## API Reference

### Python Backend (`/api/`)
- `POST /api/meeting/create` — Create meeting record
- `GET /api/meeting/join/{code}` — Get meeting by room code  
- `POST /api/meeting/{id}/chunk` — Process live audio chunk
- `POST /api/meeting/{id}/end` — End meeting
- `GET /api/meeting/{id}/summary` — Generate/get meeting summary
- `POST /api/meeting/{id}/chat` — RAG Q&A endpoint

### Node Server
- `POST /rooms/create` — Create room
- `GET /rooms/:code` — Get room info
- `POST /proxy/meeting/:id/chunk` — Proxy audio chunk
- `GET /proxy/meeting/:id/summary` — Proxy summary request
- `POST /proxy/meeting/:id/chat` — Proxy chat request

### Socket.IO Events
| Event | Direction | Description |
|---|---|---|
| `join-room` | Client→Server | Join meeting room |
| `peer-joined` | Server→Client | New participant |
| `offer/answer/ice-candidate` | Both | WebRTC signaling |
| `transcript-update` | Server→Client | New transcript segments |
| `broadcast-transcript` | Client→Server | Share my transcript |
| `mute-status` | Client→Server | Mute/video state |
| `peer-mute` | Server→Client | Peer mute state |
| `peer-left` | Server→Client | Participant left |