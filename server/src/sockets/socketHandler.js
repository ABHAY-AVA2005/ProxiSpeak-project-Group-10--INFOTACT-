import {
  addUser,
  removeUser,
  getAllUsers,
  getAllActiveUsers,
  updateUserPosition,
  getUser,
  getUserCount,
  getActiveUserCount,
  getRemoteUser,
  isRemoteUser,
  isLocalUser
} from "../services/userManager.js";
import {
  persistPlayerJoin,
  scheduleDebouncedMove,
  persistPlayerDisconnect,
  getNearbyUsers,
  getNearbyUsersInMemory,
  updateProximity,
  cleanupProximityOnDisconnect,
  userNearbyMap,
  getConfiguredMaxPeers
} from "../services/persistenceManager.js";
import {
  setupRedisSync,
  publishUserPosition,
  publishUserJoin,
  publishUserLeave,
  publishWebRTCSignal,
  publishProximityEnter,
  publishProximityLeave
} from "../services/redisSync.js";

// Per-socket state for serialized proximity processing and query coalescing
export const proximityQueues = new Map(); // socketId -> Promise
export const pendingPositions = new Map(); // socketId -> user
export const lastEvaluatedPositions = new Map(); // socketId -> { x, y }
const roomChatHistory = new Map();
const meetingChatHistory = [];
const directChatHistory = new Map();
const MAX_ROOM_CHAT_MESSAGES = 500;
const MEETING_CHAT_ROOM = "office:all";

function getDirectConversationKey(firstSocketId, secondSocketId) {
  return [firstSocketId, secondSocketId].sort().join(":");
}

/**
 * Resets all proximity queue state (useful for tests and restarts)
 */
export function resetProximityQueues() {
  proximityQueues.clear();
  pendingPositions.clear();
  lastEvaluatedPositions.clear();
}

/**
 * Register all Socket.io event listeners
 * @param {import("socket.io").Server} io - Socket.io server instance
 */
export function setupSocketHandlers(io) {

  /**
   * Helper: checks if two users are within earshot distance (default 100px)
   */
  const areUsersWithinEarshot = (userA, userB, maxDistance = 100) => {
    if (!userA || !userB) return false;
    const ax = userA.x ?? userA.position?.[0];
    const ay = userA.y ?? userA.position?.[1];
    const bx = userB.x ?? userB.position?.[0];
    const by = userB.y ?? userB.position?.[1];
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
      return false;
    }
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy <= maxDistance * maxDistance;
  };

  /**
   * Executes proximity diff calculation and emits events.
   * Uses real-time in-memory spatial lookup for sub-millisecond latency.
   */
  const runProximityDiff = async (targetSocket, user) => {
    // 1. Query nearby candidates from live in-memory users (local + remote)
    const currentNearby = await getNearbyUsersInMemory([user.x, user.y], {
      excludePlayerId: targetSocket.id,
      maxPeers: getConfiguredMaxPeers()
    });

    // 2. Filter & verify: IDs from in-memory lookup must identify active users (local or remote)
    const activeNearby = [];
    for (const candidate of currentNearby) {
      const peerId = candidate.socketId || candidate.playerId || candidate.id;
      if (!peerId || peerId === targetSocket.id) continue;

      const activeUser = getUser(peerId) || getRemoteUser(peerId);
      if (!activeUser) {
        // Stale record from past session or disconnected socket - discard!
        continue;
      }

      activeNearby.push({
        ...candidate,
        socketId: activeUser.socketId,
        id: activeUser.socketId,
        username: activeUser.username,
        x: activeUser.x,
        y: activeUser.y,
        isRemote: Boolean(activeUser.isRemote)
      });
    }

    // Check if target socket disconnected while awaiting lookup
    if (targetSocket.connected === false || !getUser(targetSocket.id)) {
      return;
    }

    const { entered, left } = updateProximity(targetSocket.id, user, activeNearby, {
      maxPeers: getConfiguredMaxPeers()
    });

    // 3. Emit nearby:enter diffs
    // Rule: lower-id-sends-offer on nearby:enter prevents WebRTC glare collisions
    for (const peer of entered) {
      const peerId = peer.socketId || peer.playerId || peer.id;
      if (!peerId) continue;

      const activePeer = getUser(peerId) || getRemoteUser(peerId);
      if (!activePeer) continue;

      // Determine who initiates offer based on lower socket ID rule
      const shouldTargetInitiate = targetSocket.id < peerId;

      // Notify active socket that peer entered proximity
      targetSocket.emit("nearby:enter", {
        socketId: peerId,
        id: peerId,
        username: activePeer.username || peer.username,
        x: activePeer.x,
        y: activePeer.y,
        shouldInitiateOffer: shouldTargetInitiate
      });

      // If peer is local, notify peer that active socket entered proximity
      if (getUser(peerId)) {
        io.to(peerId).emit("nearby:enter", {
          socketId: targetSocket.id,
          id: targetSocket.id,
          username: user.username,
          x: user.x,
          y: user.y,
          shouldInitiateOffer: !shouldTargetInitiate
        });
      } else if (isRemoteUser(peerId)) {
        publishProximityEnter({
          targetId: peerId,
          peer: {
            socketId: targetSocket.id,
            id: targetSocket.id,
            username: user.username,
            x: user.x,
            y: user.y,
            shouldInitiateOffer: !shouldTargetInitiate
          }
        });
      }
    }

    // 4. Emit nearby:leave diffs
    for (const peerId of left) {
      if (!peerId) continue;

      // Notify active socket that peer left proximity
      targetSocket.emit("nearby:leave", {
        socketId: peerId,
        id: peerId
      });

      // If peer is local, notify peer that active socket left proximity (only if peer is still connected)
      if (getUser(peerId)) {
        io.to(peerId).emit("nearby:leave", {
          socketId: targetSocket.id,
          id: targetSocket.id
        });
      } else if (isRemoteUser(peerId)) {
        publishProximityLeave({
          targetId: peerId,
          peerId: targetSocket.id
        });
      }
    }
  };

  /**
   * Safely queues proximity diff calculation for a socket.
   * - Prevents race conditions by serializing async executions per socket.
   * - Coalesces rapid intermediate movements so only the latest position is evaluated.
   * - Avoids unnecessary queries when the user is alone or position is unchanged.
   */
  const queueProximityCheck = (targetSocket, user) => {
    const socketId = targetSocket.id;

    if (targetSocket.connected === false || !getUser(socketId)) {
      return Promise.resolve();
    }

    // Avoid unnecessary queries if user is alone in the room across all instances
    if (getActiveUserCount() <= 1) {
      lastEvaluatedPositions.set(socketId, { x: user.x, y: user.y });
      return Promise.resolve();
    }

    // Avoid unnecessary query if position has not changed
    const lastPos = lastEvaluatedPositions.get(socketId);
    if (lastPos && lastPos.x === user.x && lastPos.y === user.y) {
      return Promise.resolve();
    }

    // Store latest user position to coalesce intermediate movements
    pendingPositions.set(socketId, user);

    const currentChain = proximityQueues.get(socketId) || Promise.resolve();

    const nextPromise = currentChain
      .then(async () => {
        if (targetSocket.connected === false || !getUser(socketId)) {
          pendingPositions.delete(socketId);
          return;
        }

        const latestUser = pendingPositions.get(socketId);
        if (!latestUser) {
          return;
        }
        pendingPositions.delete(socketId);

        const currentLast = lastEvaluatedPositions.get(socketId);
        if (currentLast && currentLast.x === latestUser.x && currentLast.y === latestUser.y) {
          return;
        }

        await runProximityDiff(targetSocket, latestUser);
        lastEvaluatedPositions.set(socketId, { x: latestUser.x, y: latestUser.y });
      })
      .catch((err) => {
        console.error(`Proximity check error for ${socketId}:`, err);
      });

    proximityQueues.set(socketId, nextPromise);
    return nextPromise;
  };

  io.on("connection", (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    /**
     * User joins world
     * Payload: { username?: string, x?: number, y?: number }
     */
    socket.on("join", async (payload = {}, acknowledge) => {
      // Guard against non-object payloads
      if (typeof payload !== "object" || payload === null) {
        payload = {};
      }

      const { username, x, y } = payload;
      const roomName = typeof payload.roomName === "string" && payload.roomName.trim()
        ? payload.roomName.trim().toLowerCase().slice(0, 40)
        : "default-room";
      const newUser = addUser(socket.id, username, x, y);
      socket.data.username = newUser.username;
      socket.data.status = "Available";
      socket.data.roomName = roomName;
      try {
        await Promise.all([socket.join(roomName), socket.join(MEETING_CHAT_ROOM)]);
      } catch (error) {
        console.error(`[Socket] Failed to join room '${roomName}':`, error);
        if (typeof acknowledge === "function") acknowledge({ ok: false });
        return;
      }

      console.log(`[User Joined] ${newUser.username} (${newUser.socketId}) at [${newUser.x}, ${newUser.y}]`);

      // 1. Send the current user snapshot to the joining user
      socket.emit("users:list", getAllActiveUsers());

      // 2. Broadcast to all OTHER users that someone joined
      socket.broadcast.emit("user:joined", newUser);

      // 3. Persist to MongoDB (if connected)
      persistPlayerJoin(newUser);

      // Publish join to Redis for cross-instance position sharing
      publishUserJoin(newUser);

      if (typeof acknowledge === "function") {
        acknowledge({
          ok: true,
          roomName,
          chatMessages: roomChatHistory.get(roomName) || [],
          meetingChatMessages: meetingChatHistory
        });
      }

      // 4. Calculate and emit initial proximity enter diffs on join
      await queueProximityCheck(socket, newUser);
    });

    socket.on("presence:status", (status) => {
      if (!socket.data.roomName || !socket.data.username || !["Available", "Focus", "Do Not Disturb"].includes(status)) return;
      socket.data.status = status;
      io.to(socket.data.roomName).emit("presence:status", { socketId: socket.id, status });
    });

    socket.on("meeting:action", (payload = {}) => {
      const { action, value } = payload && typeof payload === "object" ? payload : {};
      if (!socket.data.roomName || !socket.data.username) return;
      const now = Date.now();
      if (now - (socket.data.lastMeetingActionAt || 0) < 250) return;
      socket.data.lastMeetingActionAt = now;
      if (action === "hand" && typeof value === "boolean") {
        io.to(socket.data.roomName).emit("meeting:action", {
          socketId: socket.id,
          username: socket.data.username,
          action,
          value
        });
        return;
      }
      if (action === "reaction" && ["👏", "❤️", "👍"].includes(value)) {
        io.to(socket.data.roomName).emit("meeting:action", {
          socketId: socket.id,
          username: socket.data.username,
          action,
          value
        });
      }
    });

    socket.on("office:announcement", (payload = {}, acknowledge) => {
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!socket.data.roomName || !socket.data.username || !text || text.length > 240) {
        acknowledge?.({ ok: false, error: "invalid-announcement" });
        return;
      }
      const now = Date.now();
      if (now - (socket.data.lastAnnouncementAt || 0) < 10_000) {
        acknowledge?.({ ok: false, error: "Please wait before sending another announcement." });
        return;
      }
      socket.data.lastAnnouncementAt = now;
      const message = {
        id: `${socket.id}:${Date.now()}`,
        socketId: socket.id,
        username: socket.data.username,
        text,
        time: new Date(now).toISOString()
      };
      io.to(socket.data.roomName).emit("office:announcement", message);
      acknowledge?.({ ok: true, id: message.id });
    });

    socket.on("chat:message", (payload = {}, acknowledge) => {
      const respond = (result) => {
        if (typeof acknowledge === "function") acknowledge(result);
      };
      if (typeof payload.text !== "string") {
        respond({ ok: false, error: "invalid-message" });
        return;
      }
      const text = payload.text.trim();
      const roomName = socket.data.roomName;
      const scope = payload.scope === "all" ? "all" : "room";
      if (!text || text.length > 2000 || !roomName || !socket.data.username) {
        respond({ ok: false, error: "invalid-message" });
        return;
      }

      const message = {
        id: `${socket.id}:${Date.now()}`,
        senderId: socket.id,
        sender: socket.data.username || "Guest",
        scope,
        roomName,
        text,
        time: new Date().toISOString()
      };
      if (scope === "all") {
        meetingChatHistory.push(message);
        if (meetingChatHistory.length > MAX_ROOM_CHAT_MESSAGES) meetingChatHistory.shift();
        io.to(MEETING_CHAT_ROOM).emit("chat:message", message);
      } else {
        const history = roomChatHistory.get(roomName) || [];
        history.push(message);
        if (history.length > MAX_ROOM_CHAT_MESSAGES) history.shift();
        roomChatHistory.set(roomName, history);
        io.to(roomName).emit("chat:message", message);
      }
      respond({ ok: true, id: message.id });
    });

    socket.on("chat:history", (payload = {}, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      const scope = payload.scope === "all" ? "all" : "room";
      if (!socket.data.roomName || !socket.data.username) {
        acknowledge({ ok: false, error: "not-in-meeting" });
        return;
      }
      acknowledge({
        ok: true,
        messages: scope === "all"
          ? meetingChatHistory
          : roomChatHistory.get(socket.data.roomName) || []
      });
    });

    socket.on("chat:direct:message", (payload = {}, acknowledge) => {
      const respond = (result) => {
        if (typeof acknowledge === "function") acknowledge(result);
      };
      const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      const recipient = io.sockets.sockets.get(targetId);
      if (!text || text.length > 2000 || !socket.data.username || !socket.data.roomName) {
        respond({ ok: false, error: "invalid-message" });
        return;
      }
      if (!recipient || recipient.data.roomName !== socket.data.roomName || recipient.id === socket.id) {
        respond({ ok: false, error: "recipient-unavailable" });
        return;
      }

      const message = {
        id: `${socket.id}:${Date.now()}`,
        scope: "direct",
        senderId: socket.id,
        recipientId: recipient.id,
        sender: socket.data.username,
        text,
        time: new Date().toISOString()
      };
      const key = getDirectConversationKey(socket.id, recipient.id);
      const history = directChatHistory.get(key) || [];
      history.push(message);
      if (history.length > MAX_ROOM_CHAT_MESSAGES) history.shift();
      directChatHistory.set(key, history);
      socket.emit("chat:direct:message", message);
      recipient.emit("chat:direct:message", message);
      respond({ ok: true, id: message.id });
    });

    socket.on("chat:direct:history", (payload = {}, acknowledge) => {
      if (typeof acknowledge !== "function") return;
      const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
      const recipient = io.sockets.sockets.get(targetId);
      if (!socket.data.roomName || !socket.data.username || !recipient
        || recipient.data.roomName !== socket.data.roomName || recipient.id === socket.id) {
        acknowledge({ ok: false, error: "recipient-unavailable" });
        return;
      }
      const key = getDirectConversationKey(socket.id, recipient.id);
      acknowledge({ ok: true, messages: directChatHistory.get(key) || [] });
    });

    /**
     * Movement handler (listens to 'move' only)
     * Payload: { x: number, y: number }
     */
    const handleMove = async (coords) => {
      if (!coords || typeof coords !== "object") return;
      const { x, y } = coords;

      const updatedUser = updateUserPosition(socket.id, x, y);
      if (!updatedUser) return;

      // Broadcast immediately over WebSockets (zero DB lag for smooth 60 FPS motion)
      socket.broadcast.emit("user:moved", {
        socketId: socket.id,
        id: socket.id,
        username: updatedUser.username,
        x: updatedUser.x,
        y: updatedUser.y
      });

      // Publish position to Redis for cross-instance synchronization
      publishUserPosition(updatedUser);

      // Schedule debounced write to MongoDB
      scheduleDebouncedMove(socket.id, updatedUser.x, updatedUser.y);

      // Safely queue proximity check without race conditions
      await queueProximityCheck(socket, updatedUser);
    };

    socket.on("move", handleMove);

    /**
     * WebRTC Signaling Relay
     * Security & Performance Guardrails:
     * - Relay offer, answer, and ICE candidate ONLY if both users exist and are within 100px earshot.
     * - Nearest-N Peer Cap: relay only if target is in sender's active proximity set (max 6-8 peers).
     * - Lower socket ID rule prevents glare.
     */
    socket.on("webrtc:offer", ({ targetId, offer }) => {
      if (!targetId || !offer) return;
      const sender = getUser(socket.id);
      const recipient = getUser(targetId) || getRemoteUser(targetId);

      // Guardrail: relay only if both users exist and are within 100px earshot
      if (!sender || !recipient || !areUsersWithinEarshot(sender, recipient, 100)) {
        return;
      }

      // Guardrail: enforce nearest-N peer cap
      const senderProximity = userNearbyMap.get(socket.id);
      if (senderProximity && !senderProximity.has(targetId)) {
        return;
      }

      console.log(`[WebRTC] Relay offer: ${socket.id} -> ${targetId}`);
      if (getUser(targetId)) {
        io.to(targetId).emit("webrtc:offer", {
          senderId: socket.id,
          offer
        });
      } else if (isRemoteUser(targetId)) {
        publishWebRTCSignal({
          event: "webrtc:offer",
          targetId,
          senderId: socket.id,
          offer
        });
      }
    });

    socket.on("webrtc:answer", ({ targetId, answer }) => {
      if (!targetId || !answer) return;
      const sender = getUser(socket.id);
      const recipient = getUser(targetId) || getRemoteUser(targetId);

      // Guardrail: relay only if both users exist and are within 100px earshot
      if (!sender || !recipient || !areUsersWithinEarshot(sender, recipient, 100)) {
        return;
      }

      // Guardrail: enforce nearest-N peer cap
      const senderProximity = userNearbyMap.get(socket.id);
      if (senderProximity && !senderProximity.has(targetId)) {
        return;
      }

      console.log(`[WebRTC] Relay answer: ${socket.id} -> ${targetId}`);
      if (getUser(targetId)) {
        io.to(targetId).emit("webrtc:answer", {
          senderId: socket.id,
          answer
        });
      } else if (isRemoteUser(targetId)) {
        publishWebRTCSignal({
          event: "webrtc:answer",
          targetId,
          senderId: socket.id,
          answer
        });
      }
    });

    const handleIceCandidate = ({ targetId, candidate }) => {
      if (!targetId || !candidate) return;
      const sender = getUser(socket.id);
      const recipient = getUser(targetId) || getRemoteUser(targetId);

      // Guardrail: relay only if both users exist and are within 100px earshot
      if (!sender || !recipient || !areUsersWithinEarshot(sender, recipient, 100)) {
        return;
      }

      // Guardrail: enforce nearest-N peer cap
      const senderProximity = userNearbyMap.get(socket.id);
      if (senderProximity && !senderProximity.has(targetId)) {
        return;
      }

      if (getUser(targetId)) {
        io.to(targetId).emit("webrtc:ice-candidate", {
          senderId: socket.id,
          candidate
        });
      } else if (isRemoteUser(targetId)) {
        publishWebRTCSignal({
          event: "webrtc:ice-candidate",
          targetId,
          senderId: socket.id,
          candidate
        });
      }
    };

    socket.on("webrtc:ice-candidate", handleIceCandidate);
    socket.on("webrtc:ice", handleIceCandidate);

    /**
     * Disconnect cleanup
     */
    socket.on("disconnect", async (reason) => {
      const removedUser = removeUser(socket.id);
      for (const key of directChatHistory.keys()) {
        if (key.split(":").includes(socket.id)) directChatHistory.delete(key);
      }
      const roomName = socket.data.roomName;
      if (roomName && !io.sockets.adapter.rooms.get(roomName)?.size) {
        roomChatHistory.delete(roomName);
      }
      if (!io.sockets.adapter.rooms.get(MEETING_CHAT_ROOM)?.size) {
        meetingChatHistory.length = 0;
      }
      console.log(`[Socket Disconnected] ID: ${socket.id} (Reason: ${reason})`);

      if (removedUser) {
        // Broadcast user departure so all clients remove the avatar immediately
        socket.broadcast.emit("user:left", { socketId: socket.id, id: socket.id });
      }

      // Publish departure to Redis for cross-instance cleanup
      publishUserLeave(socket.id);

      // Safe DB disconnect cleanup (cancels timer, saves final state, deletes record)
      await persistPlayerDisconnect(socket.id, removedUser);

      // Clean up proximity queue and tracking state
      proximityQueues.delete(socket.id);
      pendingPositions.delete(socket.id);
      lastEvaluatedPositions.delete(socket.id);

      // Clean up proximity tracking and notify peers that this user left proximity
      const affectedPeers = cleanupProximityOnDisconnect(socket.id);
      for (const peerId of affectedPeers) {
        if (getUser(peerId)) {
          io.to(peerId).emit("nearby:leave", {
            socketId: socket.id,
            id: socket.id
          });
        } else if (isRemoteUser(peerId)) {
          publishProximityLeave({
            targetId: peerId,
            peerId: socket.id
          });
        }
      }

    });
  });

  // Initialize Redis cross-instance synchronization (if enabled)
  return setupRedisSync(io).catch((err) => {
    console.warn(`[RedisSync] Setup failed (${err.message}). Cross-instance sync paused.`);
    return false;
  });
}
