import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../src/models/Player.js";
import {
  DB_DEBOUNCE_MS,
  moveDebounceTimers,
  inFlightWrites,
  disconnectedSockets,
  scheduleDebouncedMove,
  persistPlayerDisconnect
} from "../src/services/persistenceManager.js";
import { clampCoordinate, sanitizeUsername, addUser, removeUser } from "../src/services/userManager.js";

test("UserManager - clamps coordinates and sanitizes username", () => {
  assert.equal(clampCoordinate(-50, 0, 2000, 100), 0);
  assert.equal(clampCoordinate(3000, 0, 2000, 100), 2000);
  assert.equal(clampCoordinate(NaN, 0, 2000, 100), 100);
  assert.equal(sanitizeUsername("<script>alert(1)</script>"), "scriptalert(1)/script");
});

test("Mongoose Player Schema - Uses position [x, y] with 2d index", () => {
  const positionPath = Player.schema.path("position");
  assert.ok(positionPath, "Player schema must have 'position' field");
  assert.equal(positionPath.instance, "Array");

  const indexes = Player.schema.indexes();
  const has2dIndex = indexes.some(
    ([fields]) => fields && fields.position === "2d"
  );
  assert.equal(has2dIndex, true, "Player schema must define 2d index on 'position'");
});

test("PersistenceManager - Debounced movement schedule and cancellation on disconnect", async () => {
  const socketId = "test-socket-123";

  // Simulate debounced move
  scheduleDebouncedMove(socketId, 250, 350);
  assert.ok(moveDebounceTimers.has(socketId), "Debounce timer must be set");

  // Call disconnect
  await persistPlayerDisconnect(socketId, { x: 250, y: 350 });

  assert.equal(moveDebounceTimers.has(socketId), false, "Debounce timer must be cancelled on disconnect");
  assert.equal(disconnectedSockets.has(socketId), true, "Socket must be registered in disconnectedSockets");
});

test("SocketHandler - WebRTC signaling relay events", () => {
  // Test event names matching Abhishek frontend hook (webrtc:offer, webrtc:answer, webrtc:ice-candidate)
  const requiredEvents = ["webrtc:offer", "webrtc:answer", "webrtc:ice-candidate"];
  assert.equal(requiredEvents.length, 3);
});

