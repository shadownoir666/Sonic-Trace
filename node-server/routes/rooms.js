const express = require("express");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");

const router = express.Router();
const PYTHON_URL = process.env.PYTHON_URL || "http://127.0.0.1:8000";

// In-memory room registry (room_code -> meeting info)
// For production, this would be in Redis/DB
const rooms = new Map();

/**
 * POST /rooms/create
 * Body: { title?: string }
 * Creates a 6-char room code + Python meeting record
 */
router.post("/create", async (req, res) => {
  try {
    const title = req.body.title || "New Meeting";
    
    // Generate unique 6-char room code
    let roomCode;
    do {
      roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    } while (rooms.has(roomCode));

    // Create meeting in Python backend
    const pyRes = await fetch(`${PYTHON_URL}/api/meeting/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_code: roomCode, title }),
    });

    if (!pyRes.ok) {
      const err = await pyRes.text();
      return res.status(500).json({ error: `Python backend error: ${err}` });
    }

    const meeting = await pyRes.json();
    
    // Cache in memory
    rooms.set(roomCode, {
      ...meeting,
      participants: [],
      createdAt: new Date().toISOString(),
    });

    res.json({
      roomCode,
      meetingId: meeting.meeting_id,
      title: meeting.title,
    });
  } catch (err) {
    console.error("Create room error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /rooms/:code
 * Returns room info by room code
 */
router.get("/:code", async (req, res) => {
  const code = req.params.code.toUpperCase();
  
  // Check memory cache first
  if (rooms.has(code)) {
    return res.json(rooms.get(code));
  }

  // Fallback: query Python backend
  try {
    const pyRes = await fetch(`${PYTHON_URL}/api/meeting/join/${code}`);
    if (!pyRes.ok) {
      return res.status(404).json({ error: "Room not found" });
    }
    const meeting = await pyRes.json();
    rooms.set(code, { ...meeting, participants: [] });
    return res.json(rooms.get(code));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /rooms/:code/participants
 * Returns current participant list
 */
router.get("/:code/participants", (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ participants: room.participants || [] });
});

/**
 * POST /rooms/:code/end
 * End the meeting
 */
router.post("/:code/end", async (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = rooms.get(code);
  if (!room) return res.status(404).json({ error: "Room not found" });

  try {
    await fetch(`${PYTHON_URL}/api/meeting/${room.meeting_id}/end`, {
      method: "POST",
    });
    rooms.delete(code);
    res.json({ status: "ended" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export rooms map so signaling can update participants
module.exports = { router, rooms };
