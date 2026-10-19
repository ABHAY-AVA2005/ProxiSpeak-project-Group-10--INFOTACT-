import { Player } from "../models/Player.js";
import { isDbConnected } from "../config/db.js";

// Debounce timer duration: 1000ms after last movement
export const DB_DEBOUNCE_MS = 1000;

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

      return await Player.find(query).lean().exec();
    } catch (err) {
      console.warn("MongoDB $near query failed, using in-memory fallback:", err.message);
    }
  }

  // 4. In-memory fallback calculation
  if (Array.isArray(fallbackUsers)) {
    if (fallbackUsers.length === 0) {
      return [];
    }

    const maxDistSq = validMaxDistance * validMaxDistance;
    const candidates = [];

    for (const u of fallbackUsers) {
      if (!u || typeof u !== "object") continue;

      // Match against both database playerId and in-memory socketId/id
      const id = u.playerId ?? u.socketId ?? u.id;
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

      if (distSq <= maxDistSq) {
        candidates.push({
          user: u,
          distance: Math.sqrt(distSq)
        });
      }
    }

    // Sort by ascending distance (closest first, matching MongoDB $near behavior)
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.map((item) => item.user);
  }

  return [];
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
