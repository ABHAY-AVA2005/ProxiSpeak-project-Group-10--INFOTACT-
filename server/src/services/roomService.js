import { Room } from "../models/Room.js";
import { isDbConnected } from "../config/db.js";

export const DEFAULT_ROOM = Object.freeze({
  name: "default-room",
  width: 2000,
  height: 2000,
  obstacles: []
});

const inMemoryRooms = new Map();

function normalizeObstacle(rawObstacle = {}) {
  if (!rawObstacle || typeof rawObstacle !== "object") {
    throw new Error("Room obstacle payload must be an object");
  }

  const id = String(rawObstacle.id || `obstacle-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const x = Number(rawObstacle.x);
  const y = Number(rawObstacle.y);
  const width = Number(rawObstacle.width);
  const height = Number(rawObstacle.height);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Obstacle coordinates and dimensions must be finite numbers");
  }

  return {
    id,
    x,
    y,
    width,
    height
  };
}

export function normalizeRoom(rawRoom = {}) {
  if (!rawRoom || typeof rawRoom !== "object") {
    throw new Error("Room payload must be an object");
  }

  const name = String(rawRoom.name || "default-room").trim() || "default-room";
  const width = Number(rawRoom.width ?? 2000);
  const height = Number(rawRoom.height ?? 2000);

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Room width and height must be positive numbers");
  }

  const rawObstacles = Array.isArray(rawRoom.obstacles) ? rawRoom.obstacles : [];
  const obstacles = rawObstacles.map(normalizeObstacle);

  return {
    name,
    width,
    height,
    obstacles
  };
}

export function serializeRoom(roomDoc) {
  if (!roomDoc) return null;

  return {
    name: roomDoc.name,
    width: roomDoc.width,
    height: roomDoc.height,
    obstacles: Array.isArray(roomDoc.obstacles) ? roomDoc.obstacles.map((ob) => ({
      id: ob.id,
      x: ob.x,
      y: ob.y,
      width: ob.width,
      height: ob.height
    })) : []
  };
}

export async function listRooms() {
  if (isDbConnected()) {
    try {
      const docs = await Room.find({}).lean();
      if (!docs || docs.length === 0) {
        return [serializeRoom(DEFAULT_ROOM)];
      }
      return docs.map(serializeRoom);
    } catch (err) {
      console.warn("Room lookup failed; using in-memory fallback:", err.message);
    }
  }

  if (inMemoryRooms.size === 0) {
    inMemoryRooms.set(DEFAULT_ROOM.name, { ...DEFAULT_ROOM, obstacles: [] });
  }

  return Array.from(inMemoryRooms.values());
}

export async function getRoomByName(name = "default-room") {
  const roomName = String(name || "default-room").trim() || "default-room";

  if (isDbConnected()) {
    try {
      const doc = await Room.findOne({ name: roomName }).lean();
      if (doc) return serializeRoom(doc);
    } catch (err) {
      console.warn("Room fetch failed; using in-memory fallback:", err.message);
    }
  }

  const fallback = inMemoryRooms.get(roomName) || { ...DEFAULT_ROOM, name: roomName };
  if (!fallback.name) {
    fallback.name = roomName;
  }
  inMemoryRooms.set(roomName, fallback);
  return fallback;
}

export async function upsertRoom(rawRoom = {}) {
  const normalized = normalizeRoom(rawRoom);

  if (isDbConnected()) {
    try {
      const saved = await Room.findOneAndUpdate(
        { name: normalized.name },
        { $set: normalized },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      return serializeRoom(saved);
    } catch (err) {
      console.warn("Room save failed; falling back to in-memory storage:", err.message);
    }
  }

  inMemoryRooms.set(normalized.name, normalized);
  return normalized;
}
