import { Player } from "../models/Player.js";
import { isDbConnected } from "../config/db.js";
import { getAllUsers, getAllActiveUsers } from "./userManager.js";
import {
  measureQuery,
  logQueryTiming,
  getQueryStats,
  resetQueryStats,
  getLastQueryTiming,
  TARGET_QUERY_TIME_MS
} from "./queryTimer.js";

export {
  measureQuery,
  logQueryTiming,
  getQueryStats,
  resetQueryStats,
  getLastQueryTiming,
  TARGET_QUERY_TIME_MS
};

// Debounce timer duration: 1000ms after last movement
export const DB_DEBOUNCE_MS = 1000;

// Nearest-N peer limiting configuration (default 8, allowed range 6-8)
export const DEFAULT_MAX_PEERS = 8;
export const MIN_MAX_PEERS = 6;

/**
 * Reads and bounds MAX_PEERS from environment (clamped between 6 and 8, default 8)
 * @returns {number}
 */
export function getConfiguredMaxPeers() {
  const envVal = Number(process.env.MAX_PEERS);
  if (Number.isFinite(envVal)) {
    return Math.max(MIN_MAX_PEERS, Math.min(DEFAULT_MAX_PEERS, Math.round(envVal)));
  }
  return DEFAULT_MAX_PEERS;
}

/**
 * Limits candidate peers to the nearest N peers (closest first)
 * Prevents O(N^2) WebRTC mesh connection overload on client browsers.
 *
 * @param {Array<object>} candidates - Array of candidate peers sorted nearest-first
 * @param {number|boolean|null} [maxPeers=DEFAULT_MAX_PEERS] - Peer cap threshold
 * @returns {Array<object>} Limited candidate array
 */
export function applyNearestPeerLimit(candidates, maxPeers = DEFAULT_MAX_PEERS) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (maxPeers === false || maxPeers === null || maxPeers === Infinity) {
    return candidates;
  }
  const cap = typeof maxPeers === "number" && Number.isFinite(maxPeers) && maxPeers > 0
    ? Math.max(MIN_MAX_PEERS, Math.min(DEFAULT_MAX_PEERS, Math.round(maxPeers)))
    : DEFAULT_MAX_PEERS;
  return candidates.slice(0, cap);
}

// Tracking structures for debouncing and race-condition prevention
export const moveDebounceTimers = new Map();
export const inFlightWrites = new Map();
export const disconnectedSockets = new Set();

/**
 * Persist newly joined player to MongoDB
 */
export async function persistPlayerJoin(user) {
  if (!isDbConnected()) return;

  const joinPromise = (async () => {
    try {
      if (disconnectedSockets.has(user.socketId)) return;
      await Player.findOneAndUpdate(
        { playerId: user.socketId },
        {
          $set: {
            playerId: user.socketId,
            username: user.username,
            x: user.x,
            y: user.y,
            position: [user.x, user.y],
            lastSeen: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      console.error(`MongoDB error creating player ${user.socketId}:`, err.message);
    }
  })();

  inFlightWrites.set(user.socketId, joinPromise);
  joinPromise.finally(() => {
    if (inFlightWrites.get(user.socketId) === joinPromise) {
      inFlightWrites.delete(user.socketId);
    }
  });
}

/**
 * Schedule debounced update to MongoDB for a moving player
 */
export function scheduleDebouncedMove(socketId, x, y) {
  // Guard against non-finite or invalid coordinates to protect MongoDB 2d index
  if (!socketId || !Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  // Clear previous timer for this user
  if (moveDebounceTimers.has(socketId)) {
    clearTimeout(moveDebounceTimers.get(socketId));
  }

  const timer = setTimeout(async () => {
    moveDebounceTimers.delete(socketId);

    if (disconnectedSockets.has(socketId) || !isDbConnected()) return;

    const writePromise = (async () => {

      try {
        if (disconnectedSockets.has(socketId)) return;
        await Player.updateOne(
          { playerId: socketId },
          {
            $set: {
              x,
              y,
              position: [x, y],
              lastSeen: new Date()
            }
          }
        );
      } catch (err) {
        console.error(`MongoDB error saving debounced movement for ${socketId}:`, err.message);
      }
    })();

    inFlightWrites.set(socketId, writePromise);
    try {
      await writePromise;
    } finally {
      if (inFlightWrites.get(socketId) === writePromise) {
        inFlightWrites.delete(socketId);
      }
    }
  }, DB_DEBOUNCE_MS);

  moveDebounceTimers.set(socketId, timer);
}

/**
 * Handle disconnect safely:
 * - Mark as disconnected to prevent zombie writes
 * - Clear debounce timer
 * - Await any active in-flight writes
 * - Save final position if a debounce was pending
 * - Delete record from MongoDB
 */
export async function persistPlayerDisconnect(socketId, lastState) {
  disconnectedSockets.add(socketId);

  const hadPendingDebounce = moveDebounceTimers.has(socketId);
  if (hadPendingDebounce) {
    clearTimeout(moveDebounceTimers.get(socketId));
    moveDebounceTimers.delete(socketId);
  }

  if (!isDbConnected()) {
    scheduleDisconnectedSocketCleanup(socketId);
    return;
  }

  // Await any in-flight write so it finishes before deleteOne runs
  if (inFlightWrites.has(socketId)) {
    try {
      await inFlightWrites.get(socketId);
    } catch (_) {}
    inFlightWrites.delete(socketId);
  }

  try {
    if (hadPendingDebounce && lastState && Number.isFinite(lastState.x) && Number.isFinite(lastState.y)) {
      await Player.updateOne(
        { playerId: socketId },
        {
          $set: {
            x: lastState.x,
            y: lastState.y,
            position: [lastState.x, lastState.y],
            lastSeen: new Date()
          }
        }
      );
    }
  } catch (err) {
    console.error(`MongoDB error updating final position for ${socketId}:`, err.message);
  } finally {
    try {
      await Player.deleteOne({ playerId: socketId });
    } catch (delErr) {
      console.error(`MongoDB error deleting player ${socketId}:`, delErr.message);
    }

    scheduleDisconnectedSocketCleanup(socketId);
  }
}

function scheduleDisconnectedSocketCleanup(socketId) {
  const cleanupTimer = setTimeout(() => {
    disconnectedSockets.delete(socketId);
  }, 5000);
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Find nearby players within maxDistance pixels using MongoDB $near with 2d index,
 * falling back to in-memory Euclidean distance calculation when MongoDB is unavailable.
 *
 * @param {Array<number>|{x: number, y: number}} origin - Origin coordinates [x, y] or {x, y}
 * @param {object} [options]
 * @param {number} [options.maxDistance=100] - Search radius in canvas pixels
 * @param {string} [options.excludePlayerId] - Player or socket ID to exclude from results
 * @param {Array<object>} [options.fallbackUsers] - Candidate users for offline/error fallback
 * @returns {Promise<Array<object>>} Matching users sorted by distance ascending (closest first)
 */
export async function getNearbyUsers(origin, options = {}) {
  // 1. Validate and normalize origin coordinates
  const originX = Array.isArray(origin) ? origin[0] : origin?.x;
  const originY = Array.isArray(origin) ? origin[1] : origin?.y;

  if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
    return [];
  }

  // 2. Validate maxDistance
  const {
    maxDistance,
    excludePlayerId = null,
    fallbackUsers = null
  } = options;

  let validMaxDistance = 100;
  if (maxDistance !== undefined && maxDistance !== null) {
    if (typeof maxDistance !== "number" || !Number.isFinite(maxDistance) || maxDistance < 0) {
      return [];
    }
    validMaxDistance = maxDistance;
  }

  const queryContext = {
    origin: [originX, originY],
    maxDistance: validMaxDistance,
    excludePlayerId
  };

  // 3. Query MongoDB using 2d $near if database is connected
  if (isDbConnected()) {
    try {
      const query = {
        position: {
          $near: [originX, originY],
          $maxDistance: validMaxDistance
        }
      };

      if (excludePlayerId) {
        query.playerId = { $ne: String(excludePlayerId) };
      }

      return await measureQuery(async () => {
        const docs = await Player.find(query).lean().exec();
        return docs.map((doc) => ({
          ...doc,
          socketId: doc.playerId || doc.socketId,
          id: doc.id || doc.socketId || doc.playerId
        }));
      }, { ...queryContext, source: "mongodb" });
    } catch (err) {
      console.warn("MongoDB $near query failed, using in-memory fallback:", err.message);
    }
  }

  // 4. In-memory fallback calculation
  if (Array.isArray(fallbackUsers)) {
    return await getNearbyUsersInMemory(origin, {
      maxDistance: validMaxDistance,
      excludePlayerId,
      users: fallbackUsers
    });
  }

  return [];
}

/**
 * Real-time in-memory proximity query for connected active users.
 * Performs sub-millisecond Euclidean distance calculation without database latency.
 *
 * @param {Array<number>|{x: number, y: number}} origin - Origin coordinates [x, y] or {x, y}
 * @param {object} [options]
 * @param {number} [options.maxDistance=100] - Search radius in canvas pixels (default: 100)
 * @param {string} [options.excludePlayerId] - Socket/player ID to exclude from results
 * @param {Array<object>} [options.users] - Optional candidate user list (defaults to active users from userManager)
 * @returns {Promise<Array<object>>} Matching users sorted by distance ascending (closest first)
 */
export async function getNearbyUsersInMemory(origin, options = {}) {
  // 1. Validate and normalize origin coordinates
  const originX = Array.isArray(origin) ? origin[0] : origin?.x;
  const originY = Array.isArray(origin) ? origin[1] : origin?.y;

  if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
    return [];
  }

  // 2. Validate maxDistance
  const {
    maxDistance,
    excludePlayerId = null,
    users = null
  } = options;

  let validMaxDistance = 100;
  if (maxDistance !== undefined && maxDistance !== null) {
    if (typeof maxDistance !== "number" || !Number.isFinite(maxDistance) || maxDistance < 0) {
      return [];
    }
    validMaxDistance = maxDistance;
  }

  // 3. Candidate source (defaults to active in-memory users, including remote instances)
  const candidateUsers = Array.isArray(users)
    ? users
    : (typeof getAllActiveUsers === "function" ? getAllActiveUsers() : getAllUsers());
  if (candidateUsers.length === 0) {
    return [];
  }

  const queryContext = {
    origin: [originX, originY],
    maxDistance: validMaxDistance,
    excludePlayerId
  };

  return await measureQuery(async () => {
    const maxDistSq = validMaxDistance * validMaxDistance;
    const candidates = [];

    for (const u of candidateUsers) {
      if (!u || typeof u !== "object") continue;

      // Match against both database playerId and in-memory socketId/id
      const id = u.socketId ?? u.playerId ?? u.id;
      if (excludePlayerId && id !== undefined && id !== null && String(id) === String(excludePlayerId)) {
        continue;
      }

      // Validate candidate user coordinates
      const ux = u.x ?? u.position?.[0];
      const uy = u.y ?? u.position?.[1];
      if (!Number.isFinite(ux) || !Number.isFinite(uy)) {
        continue;
      }

      const dx = ux - originX;
      const dy = uy - originY;
      const distSq = dx * dx + dy * dy;

      // Include users on exact boundary (distSq <= maxDistSq)
      if (distSq <= maxDistSq) {
        candidates.push({
          user: u,
          distance: Math.sqrt(distSq),
          x: ux,
          y: uy
        });
      }
    }

    // Sort by ascending distance (closest first, matching MongoDB $near behavior)
    candidates.sort((a, b) => a.distance - b.distance);

    const sortedUsers = candidates.map((item) => {
      const u = item.user;
      const sid = u.socketId || u.playerId || u.id;
      return {
        ...u,
        socketId: sid,
        id: u.id || sid,
        playerId: u.playerId || sid,
        x: item.x,
        y: item.y
      };
    });

    if (options.maxPeers !== undefined && options.maxPeers !== null) {
      return applyNearestPeerLimit(sortedUsers, options.maxPeers);
    }
    return sortedUsers;
  }, { ...queryContext, source: "in-memory" });
}

/**
 * Cluster users into connected proximity groups (connected components)
 * using Breadth-First Search (BFS) and the 100-pixel proximity rule.
 *
 * Transitive property: If A is within maxDistance of B, and B is within
 * maxDistance of C, then A, B, and C belong to the same group.
 *
 * @param {Array<object>|Iterable<object>} users - Collection of user objects with coordinates
 * @param {number} [maxDistance=100] - Proximity radius threshold in pixels
 * @returns {Array<Array<object>>} Disjoint clusters of connected users
 */
export function clusterUsers(users = [], maxDistance = 100) {
  if (!users) return [];

  // Convert iterable/Map/Set to an array if needed
  const userList = Array.isArray(users)
    ? users
    : typeof users.values === "function"
      ? Array.from(users.values())
      : Array.from(users);

  if (userList.length === 0) return [];

  const validMaxDistance =
    typeof maxDistance === "number" && Number.isFinite(maxDistance) && maxDistance >= 0
      ? maxDistance
      : 100;
  const maxDistSq = validMaxDistance * validMaxDistance;

  // Deduplicate users and filter out invalid/malformed entries
  const uniqueUsers = [];
  const seenIds = new Set();

  for (const u of userList) {
    if (!u || typeof u !== "object") continue;
    const id = u.playerId ?? u.socketId ?? u.id;
    if (id === undefined || id === null) continue;
    const idStr = String(id);
    if (seenIds.has(idStr)) continue;

    // Validate finite coordinates
    const ux = u.x ?? u.position?.[0];
    const uy = u.y ?? u.position?.[1];
    if (!Number.isFinite(ux) || !Number.isFinite(uy)) continue;

    seenIds.add(idStr);
    uniqueUsers.push(u);
  }

  if (uniqueUsers.length === 0) return [];
  if (uniqueUsers.length === 1) return [[uniqueUsers[0]]];

  const visited = new Set();
  const clusters = [];

  for (const user of uniqueUsers) {
    const userId = String(user.playerId ?? user.socketId ?? user.id);
    if (visited.has(userId)) continue;

    const currentCluster = [];
    const queue = [user];
    visited.add(userId);

    while (queue.length > 0) {
      const current = queue.shift();
      currentCluster.push(current);

      const currX = current.x ?? current.position?.[0];
      const currY = current.y ?? current.position?.[1];

      for (const neighbor of uniqueUsers) {
        const neighborId = String(neighbor.playerId ?? neighbor.socketId ?? neighbor.id);
        if (visited.has(neighborId)) continue;

        const nX = neighbor.x ?? neighbor.position?.[0];
        const nY = neighbor.y ?? neighbor.position?.[1];

        const dx = currX - nX;
        const dy = currY - nY;
        const distSq = dx * dx + dy * dy;

        if (distSq <= maxDistSq) {
          visited.add(neighborId);
          queue.push(neighbor);
        }
      }
    }

    clusters.push(currentCluster);
  }

  return clusters;
}

// Alias for explicit naming matching team plan
export const clusterUsersIntoGroups = clusterUsers;

// Proximity tracking state: Map<socketId, Set<nearbySocketId>>
export const userNearbyMap = new Map();

/**
 * Updates proximity tracking for a user and calculates enter/leave diffs.
 * Enforces nearest-N peer limiting (default 8, 6-8 peers) to cap WebRTC mesh connections.
 * Updates peer sets symmetrically so proximity is mutual.
 *
 * @param {string} socketId - The active user's socket ID
 * @param {object} user - The active user object ({ socketId, username, x, y })
 * @param {Array<object>} currentNearby - Users currently within proximity radius
 * @param {object} [options]
 * @param {number|boolean|null} [options.maxPeers] - Override for nearest-N peer cap
 * @returns {{ entered: Array<object>, left: Array<string> }}
 */
export function updateProximity(socketId, user, currentNearby = [], options = {}) {
  const maxPeers = options.maxPeers;
  const effectiveNearby = (maxPeers !== undefined && maxPeers !== null)
    ? applyNearestPeerLimit(currentNearby, maxPeers)
    : (Array.isArray(currentNearby) && currentNearby.length > DEFAULT_MAX_PEERS
        ? applyNearestPeerLimit(currentNearby, getConfiguredMaxPeers())
        : currentNearby);

  const currentNearbyIds = new Set(
    effectiveNearby.map((u) => u.socketId || u.playerId || u.id).filter(Boolean)
  );

  const prevNearbyIds = userNearbyMap.get(socketId) || new Set();

  const entered = [];
  const left = [];

  // 1. Identify newly entered peers
  for (const peer of effectiveNearby) {
    const peerId = peer.socketId || peer.playerId || peer.id;
    if (peerId && !prevNearbyIds.has(peerId)) {
      entered.push(peer);
      // Update peer's proximity set symmetrically
      let peerSet = userNearbyMap.get(peerId);
      if (!peerSet) {
        peerSet = new Set();
        userNearbyMap.set(peerId, peerSet);
      }
      peerSet.add(socketId);
    }
  }

  // 2. Identify peers who left proximity (moved out of range or displaced by closer peers)
  for (const peerId of prevNearbyIds) {
    if (!currentNearbyIds.has(peerId)) {
      left.push(peerId);
      // Remove socketId from peer's proximity set symmetrically
      const peerSet = userNearbyMap.get(peerId);
      if (peerSet) {
        peerSet.delete(socketId);
      }
    }
  }

  // 3. Update this user's proximity set
  userNearbyMap.set(socketId, currentNearbyIds);

  return { entered, left };
}

/**
 * Cleans up proximity tracking when a user disconnects,
 * removing them from all peers' proximity sets.
 *
 * @param {string} socketId - The disconnected user's socket ID
 * @returns {Array<string>} Array of peer socket IDs that had this user in proximity
 */
export function cleanupProximityOnDisconnect(socketId) {
  const prevNearbyIds = userNearbyMap.get(socketId);
  const affectedPeers = [];

  if (prevNearbyIds) {
    for (const peerId of prevNearbyIds) {
      affectedPeers.push(peerId);
      const peerSet = userNearbyMap.get(peerId);
      if (peerSet) {
        peerSet.delete(socketId);
      }
    }
  }

  userNearbyMap.delete(socketId);
  return affectedPeers;
}

/**
 * Resets all proximity tracking state (useful for tests and restarts)
 */
export function resetNearbyMap() {
  userNearbyMap.clear();
}
