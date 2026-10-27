import { getRedisPublisher, getRedisSubscriber, isRedisConnected } from "../config/redis.js";
import {
  addRemoteUser,
  updateRemoteUserPosition,
  removeRemoteUser,
  getRemoteUser
} from "./userManager.js";

/**
 * Unique server instance identifier to filter out self-published messages
 */
export const SERVER_ID = process.env.INSTANCE_ID || `srv_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

/**
 * Redis Pub/Sub channel constants
 */
export const REDIS_CHANNELS = Object.freeze({
  POSITIONS: "proxispeak:positions",
  LIFECYCLE: "proxispeak:lifecycle"
});

let isSubscribed = false;

/**
 * Dispatches an incoming Redis Pub/Sub message to local Socket.IO clients and remote user state.
 * Exported separately to enable thorough, isolated contract testing without network dependencies.
 *
 * @param {string} channel - Channel name
 * @param {string|object} rawMessage - JSON string or parsed object
 * @param {object} [io] - Optional Socket.IO server instance for local broadcasts
 * @returns {object|null} Parsed event payload or null if discarded
 */
export function processIncomingSyncMessage(channel, rawMessage, io = null) {
  let data;
  try {
    data = typeof rawMessage === "string" ? JSON.parse(rawMessage) : rawMessage;
  } catch (err) {
    console.warn("[RedisSync] Failed to parse pub/sub message JSON:", err.message);
    return null;
  }

  if (!data || typeof data !== "object") return null;

  // Discard messages published by THIS server instance to avoid message echoes
  if (data.serverId === SERVER_ID) {
    return null;
  }

  if (channel === REDIS_CHANNELS.POSITIONS) {
    if (data.event === "user:moved" && data.socketId) {
      let existingRemote = getRemoteUser(data.socketId);
      if (!existingRemote) {
        existingRemote = addRemoteUser(data.socketId, data.username, data.x, data.y, data.serverId);
      } else {
        updateRemoteUserPosition(data.socketId, data.x, data.y);
      }

      // Broadcast remote movement to all locally connected sockets
      if (io) {
        io.emit("user:moved", {
          socketId: data.socketId,
          id: data.socketId,
          x: data.x,
          y: data.y
        });
      }
      return data;
    }
  } else if (channel === REDIS_CHANNELS.LIFECYCLE) {
    if (data.event === "user:joined" && data.socketId) {
      addRemoteUser(data.socketId, data.username, data.x, data.y, data.serverId);

      if (io) {
        io.emit("user:joined", {
          socketId: data.socketId,
          id: data.socketId,
          username: data.username,
          x: data.x,
          y: data.y
        });
      }
      return data;
    } else if (data.event === "user:left" && data.socketId) {
      removeRemoteUser(data.socketId);

      if (io) {
        io.emit("user:left", {
          socketId: data.socketId,
          id: data.socketId
        });
      }
      return data;
    }
  }

  return null;
}

/**
 * Set up Redis Pub/Sub subscription and message forwarding to local Socket.IO instance
 * @param {import("socket.io").Server} io - Socket.io server instance
 */
export async function setupRedisSync(io) {
  const subscriber = getRedisSubscriber();
  if (!subscriber || isSubscribed) {
    return;
  }

  try {
    await subscriber.subscribe(REDIS_CHANNELS.POSITIONS, REDIS_CHANNELS.LIFECYCLE);
    isSubscribed = true;
    console.log(`[RedisSync] Subscribed to ${REDIS_CHANNELS.POSITIONS} and ${REDIS_CHANNELS.LIFECYCLE} (Server ID: ${SERVER_ID})`);

    subscriber.on("message", (channel, message) => {
      processIncomingSyncMessage(channel, message, io);
    });
  } catch (err) {
    console.warn(`[RedisSync] Could not subscribe to channels (${err.message}). Cross-instance sync paused.`);
  }
}

/**
 * Publishes user position update to Redis
 * @param {object} user - User object { socketId, username, x, y }
 */
export async function publishUserPosition(user) {
  if (!user || !user.socketId) return;
  const publisher = getRedisPublisher();
  if (!publisher || !isRedisConnected()) return;

  const payload = JSON.stringify({
    event: "user:moved",
    socketId: user.socketId,
    username: user.username,
    x: user.x,
    y: user.y,
    serverId: SERVER_ID,
    timestamp: Date.now()
  });

  try {
    await publisher.publish(REDIS_CHANNELS.POSITIONS, payload);
  } catch (err) {
    console.warn("[RedisSync] Failed to publish user position:", err.message);
  }
}

/**
 * Publishes user join event to Redis
 * @param {object} user - User object { socketId, username, x, y }
 */
export async function publishUserJoin(user) {
  if (!user || !user.socketId) return;
  const publisher = getRedisPublisher();
  if (!publisher || !isRedisConnected()) return;

  const payload = JSON.stringify({
    event: "user:joined",
    socketId: user.socketId,
    username: user.username,
    x: user.x,
    y: user.y,
    serverId: SERVER_ID,
    timestamp: Date.now()
  });

  try {
    await publisher.publish(REDIS_CHANNELS.LIFECYCLE, payload);
  } catch (err) {
    console.warn("[RedisSync] Failed to publish user join:", err.message);
  }
}

/**
 * Publishes user departure event to Redis
 * @param {string} socketId - Departed user socket ID
 */
export async function publishUserLeave(socketId) {
  if (!socketId) return;
  const publisher = getRedisPublisher();
  if (!publisher || !isRedisConnected()) return;

  const payload = JSON.stringify({
    event: "user:left",
    socketId,
    serverId: SERVER_ID,
    timestamp: Date.now()
  });

  try {
    await publisher.publish(REDIS_CHANNELS.LIFECYCLE, payload);
  } catch (err) {
    console.warn("[RedisSync] Failed to publish user leave:", err.message);
  }
}

/**
 * Resets subscription state (useful for testing)
 */
export function resetRedisSyncState() {
  isSubscribed = false;
}
