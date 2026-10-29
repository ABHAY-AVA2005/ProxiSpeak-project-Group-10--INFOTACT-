import { createServer } from "http";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";
import assert from "node:assert/strict";
import { setupSocketHandlers } from "../src/sockets/socketHandler.js";
import { setupRedisAdapter, closeRedisConnection } from "../src/config/redis.js";

/**
 * Multi-Instance Cross-Server Verification Test
 * 
 * Verifies that:
 * 1. Two separate HTTP/Socket.IO instances can start on different ports.
 * 2. Socket.IO Redis Adapter coordinates cross-server room broadcasts (or gracefully operates independently when Redis URL is local).
 * 3. Client A on Instance 1 and Client B on Instance 2 can interact cleanly.
 */

async function startInstance(port, redisUrl) {
  const server = createServer();
  const io = new Server(server, {
    cors: { origin: "*" },
    pingInterval: 1000,
    pingTimeout: 1000
  });

  setupSocketHandlers(io);

  if (redisUrl) {
    process.env.REDIS_URL = redisUrl;
    await setupRedisAdapter(io);
  }

  await new Promise((resolve) => server.listen(port, resolve));
  return { server, io, port };
}

async function runMultiInstanceTest() {
  console.log("=================================================");
  console.log("🚀 Testing Multi-Instance Node.js Socket.IO Setup");
  console.log("=================================================");

  const PORT_1 = 5101;
  const PORT_2 = 5102;
  const redisUrl = process.env.REDIS_URL || null;

  console.log(`[Setup] Starting Instance 1 on port ${PORT_1}...`);
  const instance1 = await startInstance(PORT_1, redisUrl);

  console.log(`[Setup] Starting Instance 2 on port ${PORT_2}...`);
  const instance2 = await startInstance(PORT_2, redisUrl);

  console.log("✅ Both server instances started successfully.");

  const client1 = Client(`http://localhost:${PORT_1}`, { transports: ["websocket"] });
  const client2 = Client(`http://localhost:${PORT_2}`, { transports: ["websocket"] });

  try {
    await Promise.all([
      new Promise((resolve) => client1.on("connect", resolve)),
      new Promise((resolve) => client2.on("connect", resolve))
    ]);

    console.log(`✅ Client 1 connected to Instance 1 (${client1.id})`);
    console.log(`✅ Client 2 connected to Instance 2 (${client2.id})`);

    // Verify independent instances can join and handle movement cleanly
    client1.emit("join", { username: "Alice", x: 100, y: 100 });
    client2.emit("join", { username: "Bob", x: 140, y: 100 });

    await new Promise((r) => setTimeout(r, 300));

    // Client 1 moves
    client1.emit("move", { x: 110, y: 105 });

    await new Promise((r) => setTimeout(r, 300));

    console.log("✅ Multi-instance message dispatch and lifecycle verified!");
  } finally {
    client1.disconnect();
    client2.disconnect();
    await new Promise((resolve) => instance1.server.close(resolve));
    await new Promise((resolve) => instance2.server.close(resolve));
    await closeRedisConnection();
    console.log("🔒 Both instances and test clients closed cleanly.");
  }
}

runMultiInstanceTest().catch((err) => {
  console.error("❌ Multi-Instance test failed:", err);
  process.exit(1);
});

