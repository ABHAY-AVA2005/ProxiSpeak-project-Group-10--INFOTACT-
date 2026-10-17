import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Player } from "../src/models/Player.js";
import {
  DB_DEBOUNCE_MS,
  moveDebounceTimers,
  inFlightWrites,
  disconnectedSockets,
  scheduleDebouncedMove,
  persistPlayerDisconnect,
  getNearbyUsers
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

test("PersistenceManager - Rejects invalid or non-finite coordinates defensively", () => {
  const socketId = "test-socket-invalid-coords";

  scheduleDebouncedMove(socketId, NaN, 300);
  assert.equal(moveDebounceTimers.has(socketId), false, "Must reject NaN coordinate");

  scheduleDebouncedMove(socketId, 300, Infinity);
  assert.equal(moveDebounceTimers.has(socketId), false, "Must reject Infinity coordinate");

  scheduleDebouncedMove(socketId, "400", 300);
  assert.equal(moveDebounceTimers.has(socketId), false, "Must reject string coordinate");

  scheduleDebouncedMove(null, 100, 100);
  assert.equal(moveDebounceTimers.has(null), false, "Must reject null socketId");
});

test("Mongoose Player Schema - Includes username field with default Anonymous", () => {
  const usernamePath = Player.schema.path("username");
  assert.ok(usernamePath, "Player schema must have 'username' field");
  assert.equal(usernamePath.instance, "String");
  assert.equal(usernamePath.defaultValue, "Anonymous");
});

test("getNearbyUsers - Validates origin coordinates and maxDistance defensively", async () => {
  // Invalid origins
  assert.deepEqual(await getNearbyUsers([NaN, 100]), []);
  assert.deepEqual(await getNearbyUsers([100, Infinity]), []);
  assert.deepEqual(await getNearbyUsers({ x: "invalid", y: 100 }), []);
  assert.deepEqual(await getNearbyUsers(null), []);
  assert.deepEqual(await getNearbyUsers(undefined), []);

  // Invalid maxDistance
  assert.deepEqual(await getNearbyUsers([100, 100], { maxDistance: -50 }), []);
  assert.deepEqual(await getNearbyUsers([100, 100], { maxDistance: NaN }), []);
});

test("getNearbyUsers - Handles empty fallbackUsers array cleanly", async () => {
  const result = await getNearbyUsers([100, 100], { fallbackUsers: [] });
  assert.deepEqual(result, []);
});

test("getNearbyUsers - In-memory fallback: filters by 100px boundary, excludes requester, orders by distance", async () => {
  const origin = [400, 400];
  const requesterId = "socket-requester";

  const fallbackUsers = [
    { socketId: requesterId, username: "Self", x: 400, y: 400 }, // Distance 0 (self, must be excluded)
    { socketId: "peer-far", username: "Far", x: 600, y: 400 }, // Distance 200px (outside > 100px, must be excluded)
    { socketId: "peer-outside", username: "Outside", x: 501, y: 400 }, // Distance 101px (outside > 100px, must be excluded)
    { socketId: "peer-exact", username: "ExactBoundary", x: 500, y: 400 }, // Distance exactly 100px (must be included)
    { socketId: "peer-mid", username: "MidDistance", x: 460, y: 400 }, // Distance 60px (must be included)
    { socketId: "peer-close", username: "Closest", x: 420, y: 400 }, // Distance 20px (must be included)
    { socketId: "peer-invalid", username: "InvalidCoords", x: NaN, y: 400 } // Invalid coordinates (must be skipped)
  ];

  const results = await getNearbyUsers(origin, {
    excludePlayerId: requesterId,
    fallbackUsers
  });

  // Verify count: 3 matching users (Closest, MidDistance, ExactBoundary)
  assert.equal(results.length, 3);

  // Verify ordering: ascending distance (20px, then 60px, then 100px)
  assert.equal(results[0].socketId, "peer-close");
  assert.equal(results[1].socketId, "peer-mid");
  assert.equal(results[2].socketId, "peer-exact");

  // Verify requester and outside peers are excluded
  assert.ok(!results.some((u) => u.socketId === requesterId));
  assert.ok(!results.some((u) => u.socketId === "peer-far"));
  assert.ok(!results.some((u) => u.socketId === "peer-outside"));
  assert.ok(!results.some((u) => u.socketId === "peer-invalid"));
});

test("getNearbyUsers - In-memory fallback: supports playerId property on candidate users", async () => {
  const origin = { x: 200, y: 200 };
  const fallbackUsers = [
    { playerId: "db-self", username: "Self", x: 200, y: 200 },
    { playerId: "db-peer", username: "Peer", position: [250, 200] }
  ];

  const results = await getNearbyUsers(origin, {
    excludePlayerId: "db-self",
    fallbackUsers
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].playerId, "db-peer");
});

test("getNearbyUsers - MongoDB $near query: issues correct query and excludes requester", async () => {
  const origFind = Player.find;
  const origReadyState = mongoose.connection.readyState;
  let capturedQuery = null;

  try {
    // Simulate active MongoDB connection
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
      writable: true
    });

    Player.find = (query) => {
      capturedQuery = query;
      return {
        lean: () => ({
          exec: async () => [
            { playerId: "peer-1", position: [430, 400] },
            { playerId: "peer-2", position: [480, 400] }
          ]
        })
      };
    };

    const results = await getNearbyUsers([400, 400], {
      excludePlayerId: "my-socket-id",
      maxDistance: 100
    });

    assert.ok(capturedQuery, "Player.find must be called");
    assert.deepEqual(capturedQuery.position, {
      $near: [400, 400],
      $maxDistance: 100
    });
    assert.deepEqual(capturedQuery.playerId, {
      $ne: "my-socket-id"
    });
    assert.equal(results.length, 2);
    assert.equal(results[0].playerId, "peer-1");
  } finally {
    Player.find = origFind;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: origReadyState,
      configurable: true,
      writable: true
    });
  }
});

test("getNearbyUsers - MongoDB query failure gracefully falls back to fallbackUsers", async () => {
  const origFind = Player.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
      writable: true
    });

    // Simulate database query rejection
    Player.find = () => {
      return {
        lean: () => ({
          exec: async () => {
            throw new Error("MongoNetworkTimeoutException");
          }
        })
      };
    };

    const fallbackUsers = [
      { socketId: "fallback-peer", x: 420, y: 400 }
    ];

    const results = await getNearbyUsers([400, 400], {
      excludePlayerId: "me",
      fallbackUsers
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].socketId, "fallback-peer");
  } finally {
    Player.find = origFind;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: origReadyState,
      configurable: true,
      writable: true
    });
  }
});
