/**
 * Constants for coordinate validation & sanitization
 * Grid bounds for the ProxiSpeak world canvas (e.g. 2000 x 2000)
 */
export const WORLD_BOUNDS = Object.freeze({
  MIN_X: 0,
  MAX_X: 2000,
  MIN_Y: 0,
  MAX_Y: 2000,
  DEFAULT_X: 100,
  DEFAULT_Y: 100
});

// Max length for user display names to prevent payload bloat / UI overflow
export const MAX_USERNAME_LENGTH = 30;

// In-memory store for connected users
// Key: socket.id (string)
// Value: { socketId: string, username: string, x: number, y: number, joinedAt: number }
const users = new Map();

/**
 * Sanitizes and validates a username
 * @param {any} rawName
 * @returns {string} Safe trimmed username
 */
export function sanitizeUsername(rawName) {
  if (typeof rawName !== "string") return "";
  // Strip control characters / HTML brackets to prevent XSS in clients
  return rawName.replace(/[<>]/g, "").trim().slice(0, MAX_USERNAME_LENGTH);
}

/**
 * Clamps a coordinate within world bounds and prevents NaN/Infinity
 * @param {any} val - Input coordinate
 * @param {number} min - Lower boundary
 * @param {number} max - Upper boundary
 * @param {number} fallback - Default if input is invalid
 * @returns {number} Validated coordinate
 */
export function clampCoordinate(val, min, max, fallback) {
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(num)));
}

/**
 * Add or update a user when they join
 * @param {string} socketId - Unique socket identifier
 * @param {string} username - Chosen display name
 * @param {number} x - Initial X coordinate
 * @param {number} y - Initial Y coordinate
 * @returns {object} The created/updated user object
 */
export function addUser(socketId, username, x, y) {
  const cleanName = sanitizeUsername(username) || `User_${socketId.slice(0, 4)}`;
  const validX = clampCoordinate(x, WORLD_BOUNDS.MIN_X, WORLD_BOUNDS.MAX_X, WORLD_BOUNDS.DEFAULT_X);
  const validY = clampCoordinate(y, WORLD_BOUNDS.MIN_Y, WORLD_BOUNDS.MAX_Y, WORLD_BOUNDS.DEFAULT_Y);

  const user = {
    socketId,
    username: cleanName,
    x: validX,
    y: validY,
    joinedAt: Date.now()
  };

  users.set(socketId, user);
  return user;
}

/**
 * Updates a user's position safely
 * @param {string} socketId
 * @param {number} x
 * @param {number} y
 * @returns {object|null} Updated user or null if not found
 */
export function updateUserPosition(socketId, x, y) {
  const user = users.get(socketId);
  if (!user) return null;

  user.x = clampCoordinate(x, WORLD_BOUNDS.MIN_X, WORLD_BOUNDS.MAX_X, user.x);
  user.y = clampCoordinate(y, WORLD_BOUNDS.MIN_Y, WORLD_BOUNDS.MAX_Y, user.y);
  return user;
}

/**
 * Remove a user on disconnect
 * @param {string} socketId
 * @returns {object|null} The removed user or null if not found
 */
export function removeUser(socketId) {
  const user = users.get(socketId);
  if (user) {
    users.delete(socketId);
    return user;
  }
  return null;
}

/**
 * Retrieve a user by socketId
 * @param {string} socketId
 * @returns {object|undefined}
 */
export function getUser(socketId) {
  return users.get(socketId);
}

/**
 * Get all connected users as an array
 * @returns {Array<object>}
 */
export function getAllUsers() {
  return Array.from(users.values());
}

/**
 * Get count of active users (O(1) complexity)
 * @returns {number}
 */
export function getUserCount() {
  return users.size;
}
