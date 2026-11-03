import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { setupSocketHandlers } from "./sockets/socketHandler.js";
import { getUserCount } from "./services/userManager.js";
import { connectDB } from "./config/db.js";
import { setupRedisAdapter, isRedisConnected } from "./config/redis.js";
import { DEFAULT_ROOM, getRoomByName, listRooms, upsertRoom } from "./services/roomService.js";

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Initialize MongoDB connection asynchronously
connectDB();

// Create Express app
const app = express();

// Disable 'x-powered-by' header to prevent tech stack fingerprinting
app.disable("x-powered-by");

// CORS configuration - limit origins and methods
app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true
  })
);

// Payload size limit to prevent Denial of Service (DoS) attacks
app.use(express.json({ limit: "10kb" }));

// Health and monitoring check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "ProxiSpeak Signaling Server",
    activeUsers: getUserCount(),
    redisConnected: isRedisConnected(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Room persistence endpoints for Week 4 work: save and fetch office layouts
app.get("/api/rooms", async (req, res) => {
  try {
    const rooms = await listRooms();
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message || "Unable to load rooms" });
  }
});

app.get("/api/rooms/:name", async (req, res) => {
  try {
    const room = await getRoomByName(req.params.name || DEFAULT_ROOM.name);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }
    return res.json(room);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unable to load room" });
  }
});

app.post("/api/rooms", async (req, res) => {
  try {
    const room = await upsertRoom(req.body || DEFAULT_ROOM);
    return res.status(201).json(room);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid room payload" });
  }
});

// Create HTTP server & bind Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"]
  },
  // Set ping intervals and maximum payload sizes for security & connection stability
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e5 // 100 KB max socket packet size
});

// Register socket handlers (connect, disconnect, join, users:list)
setupSocketHandlers(io);

// Initialize Redis adapter if REDIS_URL is provided, with fallback to in-memory adapter
await setupRedisAdapter(io);

// Start server
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 ProxiSpeak Server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for client: ${CLIENT_URL}`);
  console.log(`🔒 Security headers & payload caps active`);
  console.log(`===============================================`);
});
