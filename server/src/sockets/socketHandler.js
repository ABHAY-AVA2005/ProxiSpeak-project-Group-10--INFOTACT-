import {
  addUser,
  removeUser,
  getAllUsers,
  updateUserPosition,
  getUser,
  getUserCount
} from "../services/userManager.js";
import {
  persistPlayerJoin,
  scheduleDebouncedMove,
  persistPlayerDisconnect,
  getNearbyUsers,
  updateProximity,
  cleanupProximityOnDisconnect
} from "../services/persistenceManager.js";

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
   * Executes proximity diff calculation and emits events.
   * Verifies that IDs returned by getNearbyUsers() correspond to active Socket.IO sockets.
   */
  const runProximityDiff = async (targetSocket, user) => {
    // 1. Query nearby candidates from persistence layer
    const currentNearby = await getNearbyUsers([user.x, user.y], {
      excludePlayerId: targetSocket.id,
      fallbackUsers: getAllUsers()
    });

    // 2. Filter & verify: IDs from MongoDB (or fallback) must identify active Socket.IO sockets
    const activeNearby = [];
    for (const candidate of currentNearby) {
      const peerId = candidate.socketId || candidate.playerId || candidate.id;
      if (!peerId || peerId === targetSocket.id) continue;

      const activeUser = getUser(peerId);
      if (!activeUser) {
        // Stale MongoDB record from past session or disconnected socket - discard!
        continue;
      }

      activeNearby.push({
        ...candidate,
        socketId: activeUser.socketId,
        id: activeUser.socketId,
        username: activeUser.username,
        x: activeUser.x,
        y: activeUser.y
      });
    }

    // Check if target socket disconnected while awaiting getNearbyUsers
    if (targetSocket.connected === false || !getUser(targetSocket.id)) {
      return;
    }

    const { entered, left } = updateProximity(targetSocket.id, user, activeNearby);

    // 3. Emit nearby:enter diffs
    for (const peer of entered) {
      const peerId = peer.socketId || peer.playerId || peer.id;
      if (!peerId) continue;

      const activePeer = getUser(peerId);
      if (!activePeer) continue;

      // Notify active socket that peer entered proximity
      targetSocket.emit("nearby:enter", {
        socketId: peerId,
        id: peerId,
        username: activePeer.username || peer.username,
        x: activePeer.x,
        y: activePeer.y
      });

      // Notify peer that active socket entered proximity
      io.to(peerId).emit("nearby:enter", {
        socketId: targetSocket.id,
        id: targetSocket.id,
        username: user.username,
        x: user.x,
        y: user.y
      });
    }

    // 4. Emit nearby:leave diffs
    for (const peerId of left) {
      if (!peerId) continue;

      // Notify active socket that peer left proximity
      targetSocket.emit("nearby:leave", {
        socketId: peerId,
        id: peerId
      });

      // Notify peer that active socket left proximity (only if peer is still connected)
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

      // 4. Calculate and emit initial proximity enter diffs on join
      await queueProximityCheck(socket, newUser);
    });

    /**
     * Movement handler (supports both 'move' and legacy 'player-move')
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
      // Backward compatibility event
      socket.broadcast.emit("player-moved", {
        id: socket.id,
        x: updatedUser.x,
        y: updatedUser.y
      });

      // Schedule debounced write to MongoDB
      scheduleDebouncedMove(socket.id, updatedUser.x, updatedUser.y);

      // Safely queue proximity check without race conditions
      await queueProximityCheck(socket, updatedUser);
    };

    socket.on("move", handleMove);
    socket.on("player-move", handleMove);

    /**
     * Disconnect cleanup
     */
    socket.on("disconnect", async (reason) => {
      const removedUser = removeUser(socket.id);
      console.log(`[Socket Disconnected] ID: ${socket.id} (Reason: ${reason})`);

      if (removedUser) {
        // Broadcast user departure so all clients remove the avatar immediately
        socket.broadcast.emit("user:left", { socketId: socket.id });
        socket.broadcast.emit("player-disconnected", socket.id);
      }

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
}

