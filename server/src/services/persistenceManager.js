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
