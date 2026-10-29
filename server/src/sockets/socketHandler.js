import {
  addUser,
  removeUser,
  getAllUsers,
  updateUserPosition,
  getUser,
  getUserCount,
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
  publishUserLeave
} from "../services/redisSync.js";

// Per-socket state for serialized proximity processing and query coalescing
export const proximityQueues = new Map(); // socketId -> Promise
export const pendingPositions = new Map(); // socketId -> user
export const lastEvaluatedPositions = new Map(); // socketId -> { x, y }

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

    // Avoid unnecessary queries if user is alone in the room
    if (getUserCount() <= 1) {
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
    socket.on("join", async (payload = {}) => {
      // Guard against non-object payloads
      if (typeof payload !== "object" || payload === null) {
        payload = {};
      }

      const { username, x, y } = payload;
      const newUser = addUser(socket.id, username, x, y);

      console.log(`[User Joined] ${newUser.username} (${newUser.socketId}) at [${newUser.x}, ${newUser.y}]`);

      // 1. Send the current user snapshot to the joining user
      socket.emit("users:list", getAllUsers());

      // 2. Broadcast to all OTHER users that someone joined
      socket.broadcast.emit("user:joined", newUser);

      // 3. Persist to MongoDB (if connected)
      persistPlayerJoin(newUser);

      // Publish join to Redis for cross-instance position sharing
      publishUserJoin(newUser);

      // 4. Calculate and emit initial proximity enter diffs on join
      await queueProximityCheck(socket, newUser);
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
      io.to(targetId).emit("webrtc:offer", {
        senderId: socket.id,
        offer
      });
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
      io.to(targetId).emit("webrtc:answer", {
        senderId: socket.id,
        answer
      });
    });

    socket.on("webrtc:ice-candidate", ({ targetId, candidate }) => {
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

      io.to(targetId).emit("webrtc:ice-candidate", {
        senderId: socket.id,
        candidate
      });
    });

    // Also support shorter alias 'webrtc:ice'
    socket.on("webrtc:ice", ({ targetId, candidate }) => {
      if (!targetId || !candidate) return;
      const sender = getUser(socket.id);
      const recipient = getUser(targetId) || getRemoteUser(targetId);
      if (!sender || !recipient || !areUsersWithinEarshot(sender, recipient, 100)) return;

      const senderProximity = userNearbyMap.get(socket.id);
      if (senderProximity && !senderProximity.has(targetId)) return;

      io.to(targetId).emit("webrtc:ice-candidate", {
        senderId: socket.id,
        candidate
      });
    });

    /**
     * Disconnect cleanup
     */
    socket.on("disconnect", async (reason) => {
      const removedUser = removeUser(socket.id);
      console.log(`[Socket Disconnected] ID: ${socket.id} (Reason: ${reason})`);

      if (removedUser) {
        // Broadcast user departure so all clients remove the avatar immediately
        socket.broadcast.emit("user:left", { socketId: socket.id });
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
