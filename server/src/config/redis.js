import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";

let pubClient = null;
let subClient = null;
let isRedisActive = false;

/**
 * Initializes Redis connection and configures the Socket.io Redis adapter.
 * If Redis is not configured or fails to connect, gracefully falls back to in-memory mode.
 *
 * @param {import("socket.io").Server} io - Socket.io server instance
 * @returns {Promise<boolean>} Whether Redis adapter was successfully attached
 */
export async function setupRedisAdapter(io) {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI;

  if (!redisUrl) {
    console.log("ℹ️ REDIS_URL not configured. Operating with default in-memory Socket.io adapter.");
    return false;
  }

  try {
    console.log(`📡 Connecting to Redis Pub/Sub at ${redisUrl}...`);
    pubClient = createClient({ url: redisUrl });
    subClient = pubClient.duplicate();

    pubClient.on("error", (err) => {
      console.warn("⚠️ Redis Pub Client Error:", err.message);
    });

    subClient.on("error", (err) => {
      console.warn("⚠️ Redis Sub Client Error:", err.message);
    });

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    isRedisActive = true;
    console.log("✅ Socket.io Redis adapter successfully initialized and attached.");
    return true;
  } catch (err) {
    console.warn("⚠️ Failed to initialize Redis adapter. Falling back to default in-memory adapter:", err.message);
    isRedisActive = false;
    return false;
  }
}

/**
 * Returns whether Redis adapter is actively connected.
 * @returns {boolean}
 */
export function isRedisConnected() {
  return isRedisActive;
}

/**
 * Closes Redis connections gracefully on server teardown.
 */
export async function closeRedisConnection() {
  if (!isRedisActive) return;
  try {
    await Promise.allSettled([
      pubClient?.disconnect(),
      subClient?.disconnect()
    ]);
    isRedisActive = false;
    console.log("🔒 Redis connections gracefully closed.");
  } catch (err) {
    console.warn("⚠️ Error closing Redis connections:", err.message);
  }
}
