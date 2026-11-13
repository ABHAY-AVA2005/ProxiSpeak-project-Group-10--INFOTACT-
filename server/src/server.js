import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { setupSocketHandlers } from "./sockets/socketHandler.js";
import { getUserCount } from "./services/userManager.js";
import { connectDB, isDbConnected, closeDB } from "./config/db.js";
import { setupRedisAdapter, isRedisConnected, closeRedis } from "./config/redis.js";
import { SERVER_ID } from "./services/redisSync.js";
import { listRooms } from "./services/roomService.js";
import { createMeeting, deleteMeeting, listMeetings, sendMeetingInvitations } from "./services/meetingService.js";

const PORT = Number(process.env.PORT) || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// Initialize MongoDB connection (await connection attempt before starting server)
try {
  await connectDB();
} catch (err) {
  console.warn(`[MongoDB] Initialization failed (${err.message}). Continuing with in-memory persistence.`);
}

// Create Express app
const app = express();

// Disable 'x-powered-by' header to prevent tech stack fingerprinting
app.disable("x-powered-by");

// CORS configuration - limit origins and methods
app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "DELETE"],
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
    instanceId: SERVER_ID,
    port: PORT,
    redis: {
      connected: isRedisConnected()
    },
    database: {
      connected: isDbConnected()
    },
    activeUsers: getUserCount(),
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/rooms", async (_req, res) => {
  const rooms = await listRooms();
  res.json(rooms.map(({ name }) => name));
});

const meetingRequestCounts = new Map();
app.get("/api/meetings", async (req, res) => {
  const roomName = typeof req.query.roomName === "string" ? req.query.roomName.trim().toLowerCase() : "";
  const ownerId = typeof req.query.ownerId === "string" ? req.query.ownerId : "";
  if (!roomName || roomName.length > 40) return res.status(400).json({ error: "A valid roomName is required." });
  try {
    const meetings = await listMeetings(roomName, ownerId);
    res.json({ meetings, storage: isDbConnected() ? "mongodb" : "memory" });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post("/api/meetings", async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const identity = typeof req.body?.ownerId === "string" && req.body.ownerId.length >= 24
    ? req.body.ownerId
    : ip;
  const now = Date.now();
  const hasInvitees = Array.isArray(req.body?.participantEmails) && req.body.participantEmails.length > 0;
  const rate = meetingRequestCounts.get(identity);
  if (hasInvitees && rate && now - rate.startedAt < 60 * 60 * 1000 && rate.count >= 10) {
    return res.status(429).json({ error: "Too many meeting requests. Try again later." });
  }
  if (hasInvitees) {
    if (!rate || now - rate.startedAt >= 60 * 60 * 1000) meetingRequestCounts.set(identity, { startedAt: now, count: 1 });
    else rate.count += 1;
  }

  try {
    const meeting = await createMeeting(req.body);
    const invitation = await sendMeetingInvitations(meeting);
    res.status(201).json({
      meeting,
      invitationStatus: invitation.status,
      storage: isDbConnected() ? "mongodb" : "memory"
    });
  } catch (error) {
    const status = error instanceof TypeError ? 400 : 503;
    res.status(status).json({ error: error.message });
  }
});

app.delete("/api/meetings/:id", async (req, res) => {
  try {
    const deleted = await deleteMeeting(req.params.id, req.query.ownerId);
    if (!deleted) return res.status(404).json({ error: "Meeting not found or you do not own it." });
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ error: error.message });
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

// Initialize Redis and the Socket.IO adapter before registering socket handlers
try {
  await setupRedisAdapter(io);
} catch (err) {
  console.error(`[Redis] Adapter initialization failed (${err.message}).`);
  throw err;
}

// Register socket handlers (connect, disconnect, join, users:list)
await setupSocketHandlers(io);

// Start server (only after MongoDB and Redis initialization have been attempted)
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 ProxiSpeak Server running on port ${PORT} [Instance: ${SERVER_ID}]`);
  console.log(`📡 Socket.io ready for client: ${CLIENT_URL}`);
  console.log(`🔒 Security headers & payload caps active`);
  console.log(`===============================================`);
});

/**
 * Gracefully stops HTTP, Socket.IO, Redis, and Database connections
 */
export async function stopServer() {
  return new Promise((resolve) => {
    io.close(() => {
      server.close(async () => {
        try { await closeRedis(); } catch (_) {}
        try { await closeDB(); } catch (_) {}
        resolve();
      });
    });
  });
}

const handleShutdown = async (signal) => {
  console.log(`[Server] ${signal} received, shutting down gracefully...`);
  await stopServer();
  process.exit(0);
};

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

export { app, server, io };
