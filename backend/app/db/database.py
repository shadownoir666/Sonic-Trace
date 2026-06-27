

"""
SQLite async database layer for SonicTrace meetings.
Tables:
  - meetings            : meeting metadata
  - meeting_segments    : diarized + transcribed chunks
  - meeting_summaries   : generated summaries (general + per-speaker)
  - speaker_profiles    : persistent voice embeddings per meeting for cross-session mapping
"""
import aiosqlite
import os
import json
from datetime import datetime

DB_PATH = os.environ.get("SONIC_DB_PATH", "data/sonic_trace.db")


async def init_db():
    """Create tables if they don't exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
     # we used aysnc with so that once error get or request served connection automatically closed.
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS meetings (
                id          TEXT PRIMARY KEY,
                room_code   TEXT UNIQUE NOT NULL,
                title       TEXT,
                created_at  TEXT NOT NULL,
                ended_at    TEXT,
                status      TEXT DEFAULT 'active'
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS meeting_segments (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id      TEXT NOT NULL,
                speaker         TEXT NOT NULL,
                text            TEXT NOT NULL,
                start_time      REAL NOT NULL,
                end_time        REAL NOT NULL,
                emotion         TEXT,
                emotion_score   REAL,
                chunk_index     INTEGER DEFAULT 0,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS meeting_summaries (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id      TEXT NOT NULL,
                summary_type    TEXT NOT NULL DEFAULT 'general',  -- 'general' or speaker name
                overall_summary TEXT,
                key_points      TEXT,   -- JSON array
                decisions       TEXT,   -- JSON array
                pending_tasks   TEXT,   -- JSON array
                created_at      TEXT NOT NULL,
                UNIQUE(meeting_id, summary_type),
                FOREIGN KEY (meeting_id) REFERENCES meetings(id)
            )
        """)
        # Speaker profiles: stores centroid embeddings per speaker per meeting
        # so future audio chunks can resolve speaker identities consistently
        await db.execute("""
            CREATE TABLE IF NOT EXISTS speaker_profiles (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id      TEXT NOT NULL,
                speaker_label   TEXT NOT NULL,   -- e.g. "Speaker 1"
                display_name    TEXT,            -- optional human-assigned name
                embedding_json  TEXT NOT NULL,   -- JSON array of float (256-dim Resemblyzer centroid)
                segment_count   INTEGER DEFAULT 1,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                UNIQUE(meeting_id, speaker_label),
                FOREIGN KEY (meeting_id) REFERENCES meetings(id)
            )
        """)
        # Create indexes for common queries
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_segments_meeting 
            ON meeting_segments(meeting_id, chunk_index, start_time)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_profiles_meeting 
            ON speaker_profiles(meeting_id)
        """)
        await db.commit()
    print("[OK] Database initialized.", flush=True)


async def create_meeting(meeting_id: str, room_code: str, title: str = "Untitled Meeting") -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            "INSERT INTO meetings (id, room_code, title, created_at) VALUES (?, ?, ?, ?)",
            (meeting_id, room_code, title, now)
        )
        await db.commit()
    return {"id": meeting_id, "room_code": room_code, "title": title, "created_at": now}


async def get_meeting_by_code(room_code: str) -> dict | None:
   
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM meetings WHERE room_code = ?", (room_code,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def get_meeting_by_id(meeting_id: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM meetings WHERE id = ?", (meeting_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def end_meeting(meeting_id: str):
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            "UPDATE meetings SET status='ended', ended_at=? WHERE id=?",
            (now, meeting_id)
        )
        await db.commit()


async def insert_segments(meeting_id: str, segments: list, chunk_index: int = 0):
    """Bulk insert diarized segments for a meeting."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.utcnow().isoformat()
        #this executemany used to insert in on batch not just by calling insert each time (much faster )
        await db.executemany(
            """INSERT INTO meeting_segments
               (meeting_id, speaker, text, start_time, end_time, emotion, emotion_score, chunk_index, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    meeting_id,
                    seg.get("speaker", "Unknown"),
                    seg.get("text", ""),
                    seg.get("start", 0.0),
                    seg.get("end", 0.0),
                    seg.get("emotion"),
                    seg.get("emotion_score"),
                    chunk_index,
                    now,
                )
                for seg in segments
            ]
        )
        await db.commit()


async def get_all_segments(meeting_id: str) -> list:
    """Fetch all segments for a meeting ordered by start time."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM meeting_segments WHERE meeting_id=? ORDER BY chunk_index, start_time",
            (meeting_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_segments_by_speaker(meeting_id: str, speaker: str) -> list:
    """Fetch segments for a specific speaker."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM meeting_segments 
               WHERE meeting_id=? AND speaker=? 
               ORDER BY chunk_index, start_time""",
            (meeting_id, speaker)
        ) as cursor:
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]


async def get_distinct_speakers(meeting_id: str) -> list:
    """Get list of unique speakers in a meeting."""
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT DISTINCT speaker FROM meeting_segments WHERE meeting_id=? ORDER BY speaker",
            (meeting_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [row[0] for row in rows]


# ── Summary ────────────────────────────────────────────────────────────────────

async def save_summary(meeting_id: str, summary: dict, summary_type: str = "general"):
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            """INSERT OR REPLACE INTO meeting_summaries
               (meeting_id, summary_type, overall_summary, key_points, decisions, pending_tasks, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                meeting_id,
                summary_type,
                summary.get("overall_summary", ""),
                json.dumps(summary.get("key_points", [])),
                json.dumps(summary.get("decisions", [])),
                json.dumps(summary.get("pending_tasks", [])),
                now,
            )
        )
        await db.commit()


async def get_summary(meeting_id: str, summary_type: str = "general") -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM meeting_summaries WHERE meeting_id=? AND summary_type=?",
            (meeting_id, summary_type)
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            d = dict(row)
            d["key_points"] = json.loads(d.get("key_points") or "[]")
            d["decisions"] = json.loads(d.get("decisions") or "[]")
            d["pending_tasks"] = json.loads(d.get("pending_tasks") or "[]")
            return d


# ── Speaker Profiles ───────────────────────────────────────────────────────────

async def upsert_speaker_profile(
    meeting_id: str,
    speaker_label: str,
    embedding: list,  # 256-dim float list
    display_name: str | None = None,
):
    """
    Insert or update speaker embedding profile.
    On update: incrementally averages the centroid for better accuracy over time.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        now = datetime.utcnow().isoformat()

        async with db.execute(
            "SELECT * FROM speaker_profiles WHERE meeting_id=? AND speaker_label=?",
            (meeting_id, speaker_label)
        ) as cursor:
            existing = await cursor.fetchone()

        if existing:
            existing = dict(existing)
            old_count = existing["segment_count"]
            old_emb = json.loads(existing["embedding_json"])
            # Running average of centroid
            new_count = old_count + 1
            new_emb = [
                (old_emb[i] * old_count + embedding[i]) / new_count
                for i in range(len(old_emb))
            ]
            await db.execute(
                """UPDATE speaker_profiles 
                   SET embedding_json=?, segment_count=?, updated_at=?
                   WHERE meeting_id=? AND speaker_label=?""",
                (json.dumps(new_emb), new_count, now, meeting_id, speaker_label)
            )
        else:
            await db.execute(
                """INSERT INTO speaker_profiles
                   (meeting_id, speaker_label, display_name, embedding_json, segment_count, created_at, updated_at)
                   VALUES (?, ?, ?, ?, 1, ?, ?)""",
                (meeting_id, speaker_label, display_name, json.dumps(embedding), now, now)
            )
        await db.commit()


async def get_speaker_profiles(meeting_id: str) -> list:
    """Get all speaker profiles (with embeddings) for a meeting."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM speaker_profiles WHERE meeting_id=? ORDER BY speaker_label",
            (meeting_id,)
        ) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                d = dict(row)
                d["embedding"] = json.loads(d["embedding_json"])
                del d["embedding_json"]
                result.append(d)
            return result


async def rename_speaker(meeting_id: str, speaker_label: str, display_name: str):
    """Assign a human-readable name to a speaker."""
    async with aiosqlite.connect(DB_PATH) as db:
        now = datetime.utcnow().isoformat()
        await db.execute(
            """UPDATE speaker_profiles SET display_name=?, updated_at=?
               WHERE meeting_id=? AND speaker_label=?""",
            (display_name, now, meeting_id, speaker_label)
        )
        # Also update segments so transcript shows display name
        await db.execute(
            """UPDATE meeting_segments SET speaker=?
               WHERE meeting_id=? AND speaker=?""",
            (display_name, meeting_id, speaker_label)
        )
        await db.commit()
