const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const { router: roomsRouter } = require("./routes/rooms");
const proxyRouter = require("./routes/proxy");
const { setupSignaling } = require("./socket/signaling");

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);

// Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 100 * 1024 * 1024, // 100MB for audio chunks
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// REST Routes
app.use("/rooms", roomsRouter);
app.use("/proxy", proxyRouter);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", server: "sonictrace-node" }));

// Make io accessible to routes
app.set("io", io);

// WebRTC Signaling
setupSignaling(io);

server.listen(PORT, () => {
  console.log(`🚀 SonicTrace Node server running on port ${PORT}`);
});

module.exports = { app, io };
