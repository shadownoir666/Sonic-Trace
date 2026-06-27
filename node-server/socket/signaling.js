/**
 * WebRTC Signaling via Socket.IO
 * 
 * Events (client → server):
 *   join-room     { roomCode, userName, userId }
 *   offer         { target, sdp }
 *   answer        { target, sdp }
 *   ice-candidate { target, candidate }
 *   leave-room    { roomCode }
 *   mute-status   { roomCode, muted, videoOff }
 *
 * Events (server → client):
 *   room-joined   { peers: [{userId, userName, socketId}], meetingId }
 *   peer-joined   { userId, userName, socketId }
 *   peer-left     { userId, socketId }
 *   offer         { from, sdp }
 *   answer        { from, sdp }
 *   ice-candidate { from, candidate }
 *   peer-mute     { userId, muted, videoOff }
 *   transcript-update { meetingId, segments, chunkIndex }
 */

const { rooms } = require("../routes/rooms");

// socketId -> { roomCode, userId, userName }
const socketMeta = new Map();

function setupSignaling(io) {
  io.on("connection", (socket) => {
    console.log(`[signaling] Socket connected: ${socket.id}`);

    socket.on("join-room", async ({ roomCode, userName, userId }) => {
      const code = roomCode?.toUpperCase();
      if (!code) return;

      socket.join(code);
      socketMeta.set(socket.id, { roomCode: code, userId, userName });

      // Get current peers in the room
      const room = rooms.get(code) || { participants: [], meeting_id: null };
      
      // Remove stale entries for this userId (reconnect case)
      room.participants = (room.participants || []).filter(
        (p) => p.userId !== userId
      );

      const peer = { userId, userName, socketId: socket.id };
      room.participants.push(peer);
      rooms.set(code, room);

      // Tell the joiner about existing peers
      const existingPeers = room.participants.filter(
        (p) => p.socketId !== socket.id
      );
      socket.emit("room-joined", {
        peers: existingPeers,
        meetingId: room.meeting_id || room.id,
        roomCode: code,
      });

      // Tell others a new peer joined
      socket.to(code).emit("peer-joined", peer);

      console.log(`[signaling] ${userName} joined room ${code}. Peers: ${room.participants.length}`);
    });

    // Relay WebRTC offer to target
    socket.on("offer", ({ target, sdp }) => {
      const meta = socketMeta.get(socket.id);
      io.to(target).emit("offer", {
        from: socket.id,
        fromUserId: meta?.userId,
        fromUserName: meta?.userName,
        sdp,
      });
    });

    // Relay WebRTC answer
    socket.on("answer", ({ target, sdp }) => {
      const meta = socketMeta.get(socket.id);
      io.to(target).emit("answer", {
        from: socket.id,
        fromUserId: meta?.userId,
        sdp,
      });
    });

    // Relay ICE candidate
    socket.on("ice-candidate", ({ target, candidate }) => {
      io.to(target).emit("ice-candidate", {
        from: socket.id,
        candidate,
      });
    });

    // Mute/video status broadcast
    socket.on("mute-status", ({ roomCode, muted, videoOff }) => {
      const meta = socketMeta.get(socket.id);
      socket.to(roomCode?.toUpperCase()).emit("peer-mute", {
        socketId: socket.id,
        userId: meta?.userId,
        muted,
        videoOff,
      });
    });

    // Broadcast transcript update to room (from audio capture client)
    socket.on("broadcast-transcript", ({ roomCode, segments, chunkIndex, meetingId }) => {
      socket.to(roomCode?.toUpperCase()).emit("transcript-update", {
        meetingId,
        segments,
        chunkIndex,
      });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      const meta = socketMeta.get(socket.id);
      if (meta) {
        const { roomCode, userId, userName } = meta;
        const room = rooms.get(roomCode);
        if (room) {
          room.participants = room.participants.filter(
            (p) => p.socketId !== socket.id
          );
          rooms.set(roomCode, room);
        }
        socket.to(roomCode).emit("peer-left", {
          socketId: socket.id,
          userId,
          userName,
        });
        console.log(`[signaling] ${userName || socket.id} left room ${roomCode}`);
      }
      socketMeta.delete(socket.id);
    });
  });
}

module.exports = { setupSignaling };
