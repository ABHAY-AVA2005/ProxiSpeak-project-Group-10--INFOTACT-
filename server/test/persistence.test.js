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
  getNearbyUsers,
  clusterUsers,
  clusterUsersIntoGroups
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

// ---------------------------------------------------------------------
// DAY 9: Connected Components Clustering Tests
// ---------------------------------------------------------------------

test("clusterUsers - Handles empty, null, or undefined user inputs", () => {
  assert.deepEqual(clusterUsers([]), []);
  assert.deepEqual(clusterUsers(null), []);
  assert.deepEqual(clusterUsers(undefined), []);
});

test("clusterUsers - Handles a single user", () => {
  const single = [{ socketId: "user-1", username: "Solo", x: 100, y: 100 }];
  const clusters = clusterUsers(single);

  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 1);
  assert.equal(clusters[0][0].socketId, "user-1");
});

test("clusterUsers - Groups directly connected users within 100px", () => {
  const users = [
    { socketId: "u1", x: 100, y: 100 },
    { socketId: "u2", x: 160, y: 100 } // dist = 60px <= 100px
  ];

  const clusters = clusterUsers(users);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 2);
  const ids = clusters[0].map((u) => u.socketId).sort();
  assert.deepEqual(ids, ["u1", "u2"]);
});

test("clusterUsers - Places disconnected users (>100px) into separate clusters", () => {
  const users = [
    { socketId: "u1", x: 100, y: 100 },
    { socketId: "u2", x: 300, y: 100 } // dist = 200px > 100px
  ];

  const clusters = clusterUsers(users);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].length, 1);
  assert.equal(clusters[1].length, 1);
  const clusterIds = clusters.map((c) => c[0].socketId).sort();
  assert.deepEqual(clusterIds, ["u1", "u2"]);
});

test("clusterUsers - Guarantees transitivity (A near B, B near C, A far from C)", () => {
  // A at (100, 100), B at (170, 100), C at (240, 100)
  // Dist(A, B) = 70 <= 100
  // Dist(B, C) = 70 <= 100
  // Dist(A, C) = 140 > 100 (not directly in earshot, but transitively connected!)
  const users = [
    { socketId: "userA", x: 100, y: 100 },
    { socketId: "userB", x: 170, y: 100 },
    { socketId: "userC", x: 240, y: 100 }
  ];

  const clusters = clusterUsers(users);
  assert.equal(clusters.length, 1, "Must form exactly 1 transitive cluster");
  assert.equal(clusters[0].length, 3, "All 3 users must belong to the cluster");

  const clusterIds = clusters[0].map((u) => u.socketId).sort();
  assert.deepEqual(clusterIds, ["userA", "userB", "userC"]);
});

test("clusterUsers - Partitions multiple distinct groups and isolated users", () => {
  const users = [
    // Group 1: u1 and u2 (dist = 40)
    { socketId: "g1-a", x: 50, y: 50 },
    { socketId: "g1-b", x: 90, y: 50 },
    // Group 2: u3, u4, u5 (transitive chain: 500 -> 570 -> 640)
    { socketId: "g2-a", x: 500, y: 500 },
    { socketId: "g2-b", x: 570, y: 500 },
    { socketId: "g2-c", x: 640, y: 500 },
    // Isolated user
    { socketId: "isolated", x: 1800, y: 1800 }
  ];

  const clusters = clusterUsers(users);
  assert.equal(clusters.length, 3, "Must produce exactly 3 disjoint clusters");

  // Map each cluster to its sorted list of socket IDs
  const clusterMemberSets = clusters
    .map((c) => c.map((u) => u.socketId).sort())
    .sort((a, b) => a.length - b.length);

  assert.deepEqual(clusterMemberSets[0], ["isolated"]);
  assert.deepEqual(clusterMemberSets[1], ["g1-a", "g1-b"]);
  assert.deepEqual(clusterMemberSets[2], ["g2-a", "g2-b", "g2-c"]);
});

test("clusterUsers - Deduplicates identical users and filters out invalid coordinates", () => {
  const users = [
    { socketId: "dup-1", x: 100, y: 100 },
    { socketId: "dup-1", x: 100, y: 100 }, // Duplicate
    { socketId: "invalid-coords", x: NaN, y: 100 }, // Invalid coordinate
    { socketId: "no-coords" }, // Missing coordinates
    null, // Malformed entry
    { socketId: "valid-peer", x: 150, y: 100 }
  ];

  const clusters = clusterUsers(users);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].length, 2);
  const ids = clusters[0].map((u) => u.socketId).sort();
  assert.deepEqual(ids, ["dup-1", "valid-peer"]);
});

test("clusterUsers - Supports custom maxDistance threshold and clusterUsersIntoGroups alias", () => {
  const users = [
    { socketId: "p1", x: 100, y: 100 },
    { socketId: "p2", x: 160, y: 100 } // dist = 60px
  ];

  // At maxDistance = 50, dist(60) is outside -> 2 clusters
  const clustersSmall = clusterUsersIntoGroups(users, 50);
  assert.equal(clustersSmall.length, 2);

  // At maxDistance = 70, dist(60) is inside -> 1 cluster
  const clustersLarge = clusterUsersIntoGroups(users, 70);
  assert.equal(clustersLarge.length, 1);
});
