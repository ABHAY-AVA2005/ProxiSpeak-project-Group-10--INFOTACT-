import { getRedisPublisher, getRedisSubscriber, isRedisConnected } from "../config/redis.js";
import {
  addRemoteUser,
  updateRemoteUserPosition,
  removeRemoteUser,
  getRemoteUser,
  isLocalUser
} from "./userManager.js";
import { userNearbyMap } from "./persistenceManager.js";

/**
 * Unique server instance identifier to filter out self-published messages
 */
export const SERVER_ID = (process.env.INSTANCE_ID && process.env.INSTANCE_ID.trim()) || `srv_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

/**
 * Redis Pub/Sub channel constants
 */
export const REDIS_CHANNELS = Object.freeze({
  POSITIONS: "proxispeak:positions",
  LIFECYCLE: "proxispeak:lifecycle",
  SIGNALING: "proxispeak:signaling"
});

let isSubscribed = false;
let currentMessageListener = null;

/**
 * Checks whether Redis Pub/Sub channels are currently subscribed
 * @returns {boolean}
 */
export function isRedisSyncSubscribed() {
  return isSubscribed;
}

/**
 * Set up Redis Pub/Sub subscription and message forwarding to local Socket.IO instance
 * @param {import("socket.io").Server} io - Socket.io server instance
 */
export async function setupRedisSync(io) {
  const subscriber = getRedisSubscriber();
  if (!subscriber || !isRedisConnected()) {
    return false;
  }
  if (isSubscribed) {
    return true;
  }

  try {
    await subscriber.subscribe(REDIS_CHANNELS.POSITIONS, REDIS_CHANNELS.LIFECYCLE, REDIS_CHANNELS.SIGNALING);
    isSubscribed = true;
    console.log(`[RedisSync] Subscribed to ${REDIS_CHANNELS.POSITIONS}, ${REDIS_CHANNELS.LIFECYCLE}, and ${REDIS_CHANNELS.SIGNALING} (Server ID: ${SERVER_ID})`);

    if (currentMessageListener) {
      subscriber.off("message", currentMessageListener);
    }
    currentMessageListener = (channel, message) => {
      processIncomingSyncMessage(channel, message, io);
    };
    subscriber.on("message", currentMessageListener);
    return true;
  } catch (err) {
    console.warn(`[RedisSync] Could not subscribe to channels (${err.message}). Cross-instance sync paused.`);
    return false;
  }
}

/**
 * Updates remote user state and forwards server-directed signaling/proximity events.
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
      if (!getRemoteUser(data.socketId)) {
        addRemoteUser(data.socketId, data.username, data.x, data.y, data.serverId);
      } else {
        updateRemoteUserPosition(data.socketId, data.x, data.y);
      }

      return data;
    }
  } else if (channel === REDIS_CHANNELS.LIFECYCLE) {
    if (data.event === "user:joined" && data.socketId) {
      addRemoteUser(data.socketId, data.username, data.x, data.y, data.serverId);

      return data;
    } else if (data.event === "user:left" && data.socketId) {
      removeRemoteUser(data.socketId);
      return data;
    }
  } else if (channel === REDIS_CHANNELS.SIGNALING) {
    if (!data.targetId || !isLocalUser(data.targetId)) {
      // Discard: target is not hosted on this server instance
      return null;
    }

    if (data.event === "webrtc:offer") {
      if (io) {
        io.to(data.targetId).emit("webrtc:offer", {
          senderId: data.senderId,
          offer: data.offer
        });
      }
      return data;
    } else if (data.event === "webrtc:answer") {
      if (io) {
        io.to(data.targetId).emit("webrtc:answer", {
          senderId: data.senderId,
          answer: data.answer
        });
      }
      return data;
    } else if (data.event === "webrtc:ice-candidate") {
      if (io) {
        io.to(data.targetId).emit("webrtc:ice-candidate", {
          senderId: data.senderId,
          candidate: data.candidate
        });
      }
      return data;
    } else if (data.event === "proximity:enter" && data.peer) {
      if (!isLocalUser(data.targetId)) return null;

      let peerSet = userNearbyMap.get(data.targetId);
      if (!peerSet) {
        peerSet = new Set();
        userNearbyMap.set(data.targetId, peerSet);
      }
      peerSet.add(data.peer.socketId);

      if (io) {
        io.to(data.targetId).emit("nearby:enter", data.peer);
      }
      return data;
    } else if (data.event === "proximity:leave" && data.peerId) {
      if (!isLocalUser(data.targetId)) return null;

      const peerSet = userNearbyMap.get(data.targetId);
      if (peerSet) {
        peerSet.delete(data.peerId);
      }

      if (io) {
        io.to(data.targetId).emit("nearby:leave", {
          socketId: data.peerId,
          id: data.peerId
        });
      }
      return data;
    }
  }

  return null;
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
 * Publishes a WebRTC signaling message (offer, answer, ice-candidate) to Redis
 * @param {object} signal - { event, targetId, senderId, offer?, answer?, candidate? }
 */
export async function publishWebRTCSignal(signal) {
  if (!signal || !signal.targetId || !signal.event) return;
  const publisher = getRedisPublisher();
  if (!publisher || !isRedisConnected()) return;

  const payload = JSON.stringify({
    event: signal.event,
    targetId: signal.targetId,
    senderId: signal.senderId,
    offer: signal.offer,
    answer: signal.answer,
    candidate: signal.candidate,
    serverId: SERVER_ID,
    timestamp: Date.now()
  });

  try {
    await publisher.publish(REDIS_CHANNELS.SIGNALING, payload);
  } catch (err) {
    console.warn(`[RedisSync] Failed to publish ${signal.event}:`, err.message);
  }
}

/**
 * Publishes proximity enter notification for a remote peer
 * @param {object} param0 - { targetId, peer }
 */
export async function publishProximityEnter({ targetId, peer }) {
  if (!targetId || !peer) return;
  const publisher = getRedisPublisher();
  if (!publisher || !isRedisConnected()) return;

  const payload = JSON.stringify({
    event: "proximity:enter",
    targetId,
    peer,
    serverId: SERVER_ID,
    timestamp: Date.now()
  });

  try {
    await publisher.publish(REDIS_CHANNELS.SIGNALING, payload);
  } catch (err) {
    console.warn("[RedisSync] Failed to publish proximity:enter:", err.message);
  }
}

/**
 * Publishes proximity leave notification for a remote peer
 * @param {object} param0 - { targetId, peerId }
 */
export async function publishProximityLeave({ targetId, peerId }) {
  if (!targetId || !peerId) return;
  const publisher = getRedisPublisher();
  if (!publisher || !isRedisConnected()) return;

  const payload = JSON.stringify({
    event: "proximity:leave",
    targetId,
    peerId,
    serverId: SERVER_ID,
    timestamp: Date.now()
  });

  try {
    await publisher.publish(REDIS_CHANNELS.SIGNALING, payload);
  } catch (err) {
    console.warn("[RedisSync] Failed to publish proximity:leave:", err.message);
  }
}

/**
 * Resets subscription state (useful for testing)
 */
export function resetRedisSyncState() {
  isSubscribed = false;
  const subscriber = getRedisSubscriber();
  if (subscriber && currentMessageListener) {
    try { subscriber.off("message", currentMessageListener); } catch (_) {}
  }
  currentMessageListener = null;
}
