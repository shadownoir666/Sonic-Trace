
// module.exports = router;
const express = require("express");
const multer = require("multer");
const fetch = require("node-fetch");
const FormData = require("form-data");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const PYTHON_URL = process.env.PYTHON_URL || "http://127.0.0.1:8000";

// ── Audio Chunk ───────────────────────────────────────────────────────────────

/**
 * POST /proxy/meeting/:meetingId/chunk
 * Proxies audio chunk to Python backend and broadcasts result via Socket.IO
 */
router.post("/meeting/:meetingId/chunk", upload.single("file"), async (req, res) => {
  const { meetingId } = req.params;
  const chunkIndex = req.body.chunk_index || 0;

  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided" });
  }

  try {
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname || "chunk.wav",
      contentType: req.file.mimetype || "audio/wav",
    });
    form.append("chunk_index", String(chunkIndex));

    const pyRes = await fetch(`${PYTHON_URL}/api/meeting/${meetingId}/chunk`, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });

    if (!pyRes.ok) {
      const err = await pyRes.text();
      console.error(`[proxy] Python chunk error: ${err}`);
      return res.status(pyRes.status).json({ error: err });
    }

    const result = await pyRes.json();

    // Broadcast transcript + speaker updates to room participants via Socket.IO
    const io = req.app.get("io");
    if (io && result.segments?.length > 0) {
      const roomCode = req.query.room_code;
      if (roomCode) {
        io.to(roomCode).emit("transcript-update", {
          meetingId,
          segments: result.segments,
          chunkIndex: result.chunk_index,
          speakersIdentified: result.speakers_identified || [],
        });
      }
    }

    return res.json(result);
  } catch (err) {
    console.error("[proxy] Chunk processing error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

/**
 * GET /proxy/meeting/:meetingId/summary
 * General meeting summary
 */
router.get("/meeting/:meetingId/summary", async (req, res) => {
  const { meetingId } = req.params;
  const regenerate = req.query.regenerate || "false";
  try {
    const pyRes = await fetch(
      `${PYTHON_URL}/api/meeting/${meetingId}/summary?regenerate=${regenerate}`
    );
    const data = await pyRes.json();
    res.status(pyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /proxy/meeting/:meetingId/summary/all
 * All summaries (general + per speaker)
 */
router.get("/meeting/:meetingId/summary/all", async (req, res) => {
  const { meetingId } = req.params;
  const regenerate = req.query.regenerate || "false";
  try {
    const pyRes = await fetch(
      `${PYTHON_URL}/api/meeting/${meetingId}/summary/all?regenerate=${regenerate}`
    );
    const data = await pyRes.json();
    res.status(pyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /proxy/meeting/:meetingId/summary/speaker/:speakerLabel
 * Per-speaker summary
 */
router.get("/meeting/:meetingId/summary/speaker/:speakerLabel", async (req, res) => {
  const { meetingId, speakerLabel } = req.params;
  const regenerate = req.query.regenerate || "false";
  try {
    const pyRes = await fetch(
      `${PYTHON_URL}/api/meeting/${meetingId}/summary/speaker/${encodeURIComponent(speakerLabel)}?regenerate=${regenerate}`
    );
    const data = await pyRes.json();
    res.status(pyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Speakers ──────────────────────────────────────────────────────────────────

/**
 * GET /proxy/meeting/:meetingId/speakers
 * List all identified speakers with profile info
 */
router.get("/meeting/:meetingId/speakers", async (req, res) => {
  const { meetingId } = req.params;
  try {
    const pyRes = await fetch(`${PYTHON_URL}/api/meeting/${meetingId}/speakers`);
    const data = await pyRes.json();
    res.status(pyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /proxy/meeting/:meetingId/speakers/:speakerLabel/rename
 * Rename a speaker
 */
router.post("/meeting/:meetingId/speakers/:speakerLabel/rename", async (req, res) => {
  const { meetingId, speakerLabel } = req.params;
  try {
    const pyRes = await fetch(
      `${PYTHON_URL}/api/meeting/${meetingId}/speakers/${encodeURIComponent(speakerLabel)}/rename`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: req.body.display_name }),
      }
    );
    const data = await pyRes.json();
    res.status(pyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Chat ──────────────────────────────────────────────────────────────────────

/**
 * POST /proxy/meeting/:meetingId/chat
 * RAG-powered chatbot
 */
router.post("/meeting/:meetingId/chat", async (req, res) => {
  const { meetingId } = req.params;
  try {
    const pyRes = await fetch(`${PYTHON_URL}/api/meeting/${meetingId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: req.body.question }),
    });
    const data = await pyRes.json();
    res.status(pyRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
