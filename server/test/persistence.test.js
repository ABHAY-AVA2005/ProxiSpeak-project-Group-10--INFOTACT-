import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
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
  clusterUsersIntoGroups,
  userNearbyMap,
  updateProximity,
  cleanupProximityOnDisconnect,
  resetNearbyMap,
  measureQuery,
  logQueryTiming,
  getQueryStats,
  resetQueryStats,
  getLastQueryTiming,
  TARGET_QUERY_TIME_MS
} from "../src/services/persistenceManager.js";
import { sanitizeLogData } from "../src/services/queryTimer.js";
import { clampCoordinate, sanitizeUsername, addUser, removeUser, getAllUsers } from "../src/services/userManager.js";
import { setupSocketHandlers, resetProximityQueues } from "../src/sockets/socketHandler.js";

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

// ---------------------------------------------------------------------
// DAY 10: Proximity Diff Events (nearby:enter, nearby:leave) Tests
// ---------------------------------------------------------------------

test("updateProximity - Calculates enter diff and updates proximity tracking symmetrically", () => {
  resetNearbyMap();

  const userA = { socketId: "user-A", username: "Alice", x: 100, y: 100 };
  const userB = { socketId: "user-B", username: "Bob", x: 150, y: 100 }; // dist = 50px <= 100px

  // User A detects User B nearby
  const diffA = updateProximity("user-A", userA, [userB]);
  assert.equal(diffA.entered.length, 1);
  assert.equal(diffA.entered[0].socketId, "user-B");
  assert.equal(diffA.left.length, 0);

  // Assert symmetric tracking
  assert.ok(userNearbyMap.get("user-A").has("user-B"));
  assert.ok(userNearbyMap.get("user-B").has("user-A"));

  resetNearbyMap();
});

test("updateProximity - Calculates leave diff and updates proximity tracking symmetrically", () => {
  resetNearbyMap();

  const userA = { socketId: "user-A", username: "Alice", x: 100, y: 100 };
  const userB = { socketId: "user-B", username: "Bob", x: 150, y: 100 };

  // Initial enter
  updateProximity("user-A", userA, [userB]);

  // User A moves far away: current nearby list is empty
  const diffLeave = updateProximity("user-A", userA, []);
  assert.equal(diffLeave.entered.length, 0);
  assert.equal(diffLeave.left.length, 1);
  assert.equal(diffLeave.left[0], "user-B");

  // Assert symmetric removal
  assert.equal(userNearbyMap.get("user-A").has("user-B"), false);
  assert.equal(userNearbyMap.get("user-B").has("user-A"), false);

  resetNearbyMap();
});

test("updateProximity - Does not emit diffs when proximity has not changed", () => {
  resetNearbyMap();

  const userA = { socketId: "user-A", username: "Alice", x: 100, y: 100 };
  const userB = { socketId: "user-B", username: "Bob", x: 150, y: 100 };

  // First check: enters
  updateProximity("user-A", userA, [userB]);

  // Second check: user A moved 5px, still near B
  const diffUnchanged = updateProximity("user-A", { ...userA, x: 105 }, [userB]);
  assert.equal(diffUnchanged.entered.length, 0, "No duplicate enter event");
  assert.equal(diffUnchanged.left.length, 0, "No false leave event");

  resetNearbyMap();
});

test("cleanupProximityOnDisconnect - Cleans up user and notifies affected peers without notifying disconnected socket", () => {
  resetNearbyMap();

  const userA = { socketId: "user-A", username: "Alice", x: 100, y: 100 };
  const userB = { socketId: "user-B", username: "Bob", x: 150, y: 100 };
  const userC = { socketId: "user-C", username: "Charlie", x: 120, y: 100 };

  // Connect A with B and C
  updateProximity("user-A", userA, [userB, userC]);

  // A disconnects
  const affected = cleanupProximityOnDisconnect("user-A");

  // Peers B and C are returned so they can receive nearby:leave
  assert.deepEqual(affected.sort(), ["user-B", "user-C"]);

  // A is purged from map and removed from peer sets
  assert.equal(userNearbyMap.has("user-A"), false);
  assert.equal(userNearbyMap.get("user-B").has("user-A"), false);
  assert.equal(userNearbyMap.get("user-C").has("user-A"), false);

  resetNearbyMap();
});

// Shared helper mocks for socket and io
function createMockSocket(id) {
  const socket = new EventEmitter();
  socket.id = id;
  socket.connected = true;
  socket.emitted = [];
  socket.broadcastEmitted = [];
  socket.emit = (event, ...args) => {
    socket.emitted.push({ event, data: args[0] });
    return true;
  };
  socket.broadcast = {
    emit: (event, ...args) => {
      socket.broadcastEmitted.push({ event, data: args[0] });
      return true;
    }
  };
  return socket;
}

function createMockIO() {
  const io = new EventEmitter();
  const rooms = new Map();
  io.to = (targetId) => ({
    emit: (event, data) => {
      let list = rooms.get(targetId);
      if (!list) {
        list = [];
        rooms.set(targetId, list);
      }
      list.push({ event, data });
    }
  });
  io.getEmittedTo = (targetId) => rooms.get(targetId) || [];
  return io;
}

test("getNearbyUsers - Normalizes socketId from MongoDB playerId and fallback user objects", async () => {
  const origFind = Player.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
      writable: true
    });

    Player.find = () => ({
      lean: () => ({
        exec: async () => [
          { playerId: "mongo-peer-1", username: "MongoUser", position: [110, 100] }
        ]
      })
    });

    // 1. MongoDB query path
    const dbResults = await getNearbyUsers([100, 100], { maxDistance: 100 });
    assert.equal(dbResults.length, 1);
    assert.equal(dbResults[0].playerId, "mongo-peer-1");
    assert.equal(dbResults[0].socketId, "mongo-peer-1", "Must populate socketId from playerId");

    // 2. Fallback path with playerId
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 0,
      configurable: true,
      writable: true
    });

    const fbResults = await getNearbyUsers([100, 100], {
      fallbackUsers: [{ playerId: "fb-peer-2", username: "FbUser", x: 120, y: 100 }]
    });
    assert.equal(fbResults.length, 1);
    assert.equal(fbResults[0].socketId, "fb-peer-2", "Fallback must normalize socketId from playerId");
  } finally {
    Player.find = origFind;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: origReadyState,
      configurable: true,
      writable: true
    });
  }
});

test("SocketHandler - Full proximity lifecycle: nearby:enter, nearby:leave, unchanged proximity, and disconnect", async () => {
  resetNearbyMap();
  resetProximityQueues();

  const io = createMockIO();
  setupSocketHandlers(io);

  const socketA = createMockSocket("socket-alice");
  const socketB = createMockSocket("socket-bob");

  try {
    io.emit("connection", socketA);
    io.emit("connection", socketB);

    // 1. Join far apart: Alice at (100, 100), Bob at (500, 100) -> distance = 400px (> 100px)
    const [joinHandlerA] = socketA.listeners("join");
    const [joinHandlerB] = socketB.listeners("join");

    await joinHandlerA({ username: "Alice", x: 100, y: 100 });
    await joinHandlerB({ username: "Bob", x: 500, y: 100 });

    // Verify neither received nearby:enter
    assert.equal(socketA.emitted.filter((e) => e.event === "nearby:enter").length, 0);
    assert.equal(socketB.emitted.filter((e) => e.event === "nearby:enter").length, 0);

    // 2. Bob moves into range: Bob moves to (160, 100) -> distance = 60px (<= 100px)
    const [moveHandlerB] = socketB.listeners("move");
    await moveHandlerB({ x: 160, y: 100 });

    // Both should receive nearby:enter!
    const bEnterEvents = socketB.emitted.filter((e) => e.event === "nearby:enter");
    assert.equal(bEnterEvents.length, 1, "Bob must receive nearby:enter for Alice");
    assert.equal(bEnterEvents[0].data.socketId, "socket-alice");

    const aReceivedFromIO = io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:enter");
    assert.equal(aReceivedFromIO.length, 1, "Alice must receive nearby:enter for Bob via io.to");
    assert.equal(aReceivedFromIO[0].data.socketId, "socket-bob");

    // 3. Unchanged proximity: Bob moves slightly to (165, 100) -> distance = 65px (<= 100px)
    await moveHandlerB({ x: 165, y: 100 });

    // Count of nearby:enter should NOT increase; no nearby:leave should be emitted
    assert.equal(socketB.emitted.filter((e) => e.event === "nearby:enter").length, 1, "No duplicate nearby:enter");
    assert.equal(socketB.emitted.filter((e) => e.event === "nearby:leave").length, 0, "No unexpected nearby:leave");
    assert.equal(io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:enter").length, 1);
    assert.equal(io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:leave").length, 0);

    // 4. Bob moves away: Bob moves to (600, 100) -> distance = 500px (> 100px)
    await moveHandlerB({ x: 600, y: 100 });

    // Both should receive nearby:leave!
    const bLeaveEvents = socketB.emitted.filter((e) => e.event === "nearby:leave");
    assert.equal(bLeaveEvents.length, 1, "Bob must receive nearby:leave for Alice");
    assert.equal(bLeaveEvents[0].data.socketId, "socket-alice");

    const aLeaveFromIO = io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:leave");
    assert.equal(aLeaveFromIO.length, 1, "Alice must receive nearby:leave for Bob via io.to");
    assert.equal(aLeaveFromIO[0].data.socketId, "socket-bob");

    // 5. Bob moves back into range: (150, 100)
    await moveHandlerB({ x: 150, y: 100 });
    assert.equal(socketB.emitted.filter((e) => e.event === "nearby:enter").length, 2);

    // 6. Bob disconnects: Bob's socket must not be notified, Alice must receive nearby:leave
    const [disconnectHandlerB] = socketB.listeners("disconnect");
    await disconnectHandlerB("client namespace disconnect");

    const aFinalLeaves = io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:leave");
    assert.equal(aFinalLeaves.length, 2, "Alice must receive nearby:leave when Bob disconnects");
    assert.equal(aFinalLeaves[1].data.socketId, "socket-bob");

    // Disconnected socketB was NOT notified
    const bDisconnectLeaves = socketB.emitted.filter((e) => e.event === "nearby:leave");
    assert.equal(bDisconnectLeaves.length, 1, "Bob must not be notified of leave on own disconnect");
  } finally {
    removeUser("socket-alice");
    removeUser("socket-bob");
    resetNearbyMap();
    resetProximityQueues();
  }
});

test("SocketHandler - Discards stale/disconnected MongoDB records without active Socket.IO socket", async () => {
  resetNearbyMap();
  resetProximityQueues();

  const origFind = Player.find;
  const origFindOneAndUpdate = Player.findOneAndUpdate;
  const origReadyState = mongoose.connection.readyState;

  const io = createMockIO();
  setupSocketHandlers(io);

  const socketA = createMockSocket("socket-alice");
  const socketB = createMockSocket("socket-bob");

  try {
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
      writable: true
    });

    Player.findOneAndUpdate = () => Promise.resolve();

    // Mock Player.find to return an active socket (Alice) AND a stale offline record
    Player.find = () => ({
      lean: () => ({
        exec: async () => [
          { playerId: "socket-alice", username: "Alice", position: [100, 100] },
          { playerId: "stale-offline-zombie", username: "Ghost", position: [110, 100] }
        ]
      })
    });

    io.emit("connection", socketA);
    io.emit("connection", socketB);

    const [joinHandlerA] = socketA.listeners("join");
    const [joinHandlerB] = socketB.listeners("join");

    await joinHandlerA({ username: "Alice", x: 100, y: 100 });
    // Bob joins within 40px of Alice
    await joinHandlerB({ username: "Bob", x: 140, y: 100 });

    // Bob should receive nearby:enter for active Alice
    const bobEnters = socketB.emitted.filter((e) => e.event === "nearby:enter");
    assert.ok(bobEnters.some((e) => e.data.socketId === "socket-alice"), "Bob must enter with active peer Alice");

    // Alice should also receive nearby:enter for Bob via io.to
    const aliceReceived = io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:enter");
    assert.ok(aliceReceived.some((e) => e.data.socketId === "socket-bob"), "Alice must receive nearby:enter for Bob");

    // Neither Bob nor Alice should receive nearby:enter for stale-offline-zombie!
    assert.equal(
      bobEnters.some((e) => e.data.socketId === "stale-offline-zombie"),
      false,
      "Bob must not receive nearby:enter for stale offline record"
    );
    assert.equal(
      aliceReceived.some((e) => e.data.socketId === "stale-offline-zombie"),
      false,
      "Alice must not receive nearby:enter for stale offline record"
    );
  } finally {
    Player.find = origFind;
    Player.findOneAndUpdate = origFindOneAndUpdate;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: origReadyState,
      configurable: true,
      writable: true
    });
    removeUser("socket-alice");
    removeUser("socket-bob");
    resetNearbyMap();
    resetProximityQueues();
  }
});

test("SocketHandler - Bypasses proximity queries when user is alone in the room or position is unchanged", async () => {
  resetNearbyMap();
  resetProximityQueues();

  let queryCallCount = 0;
  const origFind = Player.find;
  const origFindOneAndUpdate = Player.findOneAndUpdate;
  const origReadyState = mongoose.connection.readyState;

  const io = createMockIO();
  setupSocketHandlers(io);

  const socketSolo = createMockSocket("socket-solo");

  try {
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
      writable: true
    });

    Player.findOneAndUpdate = () => Promise.resolve();

    Player.find = () => {
      queryCallCount++;
      return {
        lean: () => ({
          exec: async () => []
        })
      };
    };

    io.emit("connection", socketSolo);
    const [joinHandler] = socketSolo.listeners("join");
    const [moveHandler] = socketSolo.listeners("move");

    await joinHandler({ username: "Solo", x: 100, y: 100 });

    // User is alone in the room: move should bypass query completely
    await moveHandler({ x: 120, y: 100 });
    await moveHandler({ x: 130, y: 100 });

    assert.equal(queryCallCount, 0, "Must not query database when alone in the room");

    // Now introduce a second user
    const socketPeer = createMockSocket("socket-peer");
    io.emit("connection", socketPeer);
    const [peerJoinHandler] = socketPeer.listeners("join");
    await peerJoinHandler({ username: "Peer", x: 500, y: 100 });

    const countAfterPeerJoin = queryCallCount;

    // Moving with identical coordinates must bypass query
    const [peerMoveHandler] = socketPeer.listeners("move");
    await peerMoveHandler({ x: 500, y: 100 });
    assert.equal(queryCallCount, countAfterPeerJoin, "Unchanged coordinates must not trigger query");
  } finally {
    Player.find = origFind;
    Player.findOneAndUpdate = origFindOneAndUpdate;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: origReadyState,
      configurable: true,
      writable: true
    });
    removeUser("socket-solo");
    removeUser("socket-peer");
    resetNearbyMap();
    resetProximityQueues();
  }
});

test("SocketHandler - Serializes rapid movements and avoids race conditions via queue coalescing", async () => {
  resetNearbyMap();
  resetProximityQueues();

  const io = createMockIO();
  setupSocketHandlers(io);

  const socketA = createMockSocket("socket-alice");
  const socketB = createMockSocket("socket-bob");

  try {
    io.emit("connection", socketA);
    io.emit("connection", socketB);

    const [joinHandlerA] = socketA.listeners("join");
    const [joinHandlerB] = socketB.listeners("join");

    await joinHandlerA({ username: "Alice", x: 100, y: 100 });
    await joinHandlerB({ username: "Bob", x: 500, y: 100 });

    const [moveHandlerB] = socketB.listeners("move");

    // Send 4 rapid consecutive movements without awaiting in-between
    const p1 = moveHandlerB({ x: 450, y: 100 });
    const p2 = moveHandlerB({ x: 400, y: 100 });
    const p3 = moveHandlerB({ x: 300, y: 100 });
    const p4 = moveHandlerB({ x: 150, y: 100 }); // Within 50px of Alice (100, 100)

    await Promise.all([p1, p2, p3, p4]);

    // Bob should have entered Alice's proximity
    const bEnterEvents = socketB.emitted.filter((e) => e.event === "nearby:enter");
    assert.equal(bEnterEvents.length, 1, "Bob must receive exactly one nearby:enter after rapid moves");
    assert.equal(bEnterEvents[0].data.socketId, "socket-alice");

    // Alice should also have received nearby:enter
    const aReceivedFromIO = io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:enter");
    assert.equal(aReceivedFromIO.length, 1, "Alice must receive exactly one nearby:enter");

    // Now send 3 rapid movements moving far away
    const p5 = moveHandlerB({ x: 140, y: 100 });
    const p6 = moveHandlerB({ x: 300, y: 100 });
    const p7 = moveHandlerB({ x: 600, y: 100 }); // Far away

    await Promise.all([p5, p6, p7]);

    // Both should have received nearby:leave
    const bLeaveEvents = socketB.emitted.filter((e) => e.event === "nearby:leave");
    assert.equal(bLeaveEvents.length, 1, "Bob must receive nearby:leave");
    assert.equal(bLeaveEvents[0].data.socketId, "socket-alice");

    const aLeaveEvents = io.getEmittedTo("socket-alice").filter((e) => e.event === "nearby:leave");
    assert.equal(aLeaveEvents.length, 1, "Alice must receive nearby:leave");

    // Assert proximity map is clean
    assert.equal(userNearbyMap.get("socket-alice")?.has("socket-bob") || false, false);
    assert.equal(userNearbyMap.get("socket-bob")?.has("socket-alice") || false, false);
  } finally {
    removeUser("socket-alice");
    removeUser("socket-bob");
    resetNearbyMap();
    resetProximityQueues();
  }
});

// ---------------------------------------------------------------------
// DAY 11: Query Timing Logger Tests (Target: <= 20 ms)
// ---------------------------------------------------------------------

test("QueryTimer - Sanitizes secrets, credentials, and connection strings from log outputs", () => {
  const secretMongoUri = "mongodb://admin:secretpassword123@cluster0.abc.mongodb.net/proxispeak?retryWrites=true";
  const sanitizedUri = sanitizeLogData(secretMongoUri);
  assert.equal(sanitizedUri.includes("secretpassword123"), false, "Must redact passwords from Mongo URI");
  assert.equal(sanitizedUri.includes("mongodb://[REDACTED]"), true);

  const secretSrvUri = "mongodb+srv://root:supersecret@mycluster.mongodb.net";
  assert.equal(sanitizeLogData(secretSrvUri).includes("supersecret"), false);

  const queryWithToken = "type=search&token=abc12345secretToken&user=alice";
  assert.equal(sanitizeLogData(queryWithToken).includes("abc12345secretToken"), false);

  // Object with secret keys
  const sensitiveObj = {
    origin: [100, 100],
    maxDistance: 100,
    mongoUri: "mongodb://user:pass@localhost/db",
    apiToken: "super-secret-key"
  };
  const cleanObj = sanitizeLogData(sensitiveObj);
  assert.equal(cleanObj.mongoUri, "[REDACTED]");
  assert.equal(cleanObj.apiToken, "[REDACTED]");
  assert.deepEqual(cleanObj.origin, [100, 100]);
});

test("QueryTimer - Measures execution duration and computes performance statistics", async () => {
  resetQueryStats();

  const origNow = performance.now;
  try {
    let callCount = 0;
    // Mock performance.now to simulate a deterministic 10ms execution, eliminating OS timer jitter
    performance.now = () => {
      callCount++;
      return callCount === 1 ? 100 : 110;
    };

    const mockQuery = async () => {
      return [{ id: "user-1" }, { id: "user-2" }];
    };

    const results = await measureQuery(mockQuery, {
      source: "in-memory",
      origin: [200, 200],
      maxDistance: 100
    });

    assert.equal(results.length, 2);

    const lastTiming = getLastQueryTiming();
    assert.ok(lastTiming, "Must capture last query timing record");
    assert.equal(lastTiming.source, "in-memory");
    assert.equal(lastTiming.resultCount, 2);
    assert.deepEqual(lastTiming.origin, [200, 200]);
    assert.equal(lastTiming.maxDistance, 100);
    assert.equal(lastTiming.durationMs, 10);
    assert.equal(lastTiming.targetMet, true, "10ms query meets <20ms target");
  } finally {
    performance.now = origNow;
    resetQueryStats();
  }
});

test("QueryTimer - Enforces strict < 20ms performance target at the exact 20ms boundary", async () => {
  resetQueryStats();

  // 1. Strictly below boundary: 19.999ms -> targetMet must be true
  const underRecord = logQueryTiming({
    source: "in-memory",
    durationMs: 19.999,
    resultCount: 1
  });
  assert.equal(underRecord.targetMet, true, "19.999ms is strictly under 20ms and must meet target");

  // 2. Exact boundary: 20.000ms -> targetMet must be false (strict < 20ms requirement)
  const exactRecord = logQueryTiming({
    source: "in-memory",
    durationMs: 20.0,
    resultCount: 1
  });
  assert.equal(exactRecord.targetMet, false, "Exact 20.0ms does not meet strict < 20ms target");

  // 3. Strictly above boundary: 20.001ms -> targetMet must be false
  const overRecord = logQueryTiming({
    source: "in-memory",
    durationMs: 20.001,
    resultCount: 1
  });
  assert.equal(overRecord.targetMet, false, "20.001ms exceeds 20ms target");

  // 4. Verify measureQuery at exact 20ms boundary using controlled performance.now
  const origNow = performance.now;
  try {
    let callCount = 0;
    performance.now = () => (callCount++ === 0 ? 0 : 20.0);
    await measureQuery(async () => [{ id: "boundary-user" }], { source: "in-memory" });
    const measuredBoundary = getLastQueryTiming();
    assert.equal(measuredBoundary.durationMs, 20);
    assert.equal(measuredBoundary.targetMet, false, "measureQuery at exact 20ms boundary must have targetMet = false");
  } finally {
    performance.now = origNow;
    resetQueryStats();
  }
});

test("QueryTimer - Tracks target compliance and alerts on queries exceeding 20ms", () => {
  resetQueryStats();

  // 1. Fast query (5ms <= 20ms target)
  const fastRecord = logQueryTiming({
    source: "mongodb",
    durationMs: 5.25,
    resultCount: 3,
    origin: [100, 100],
    maxDistance: 100
  });
  assert.equal(fastRecord.targetMet, true);
  assert.equal(fastRecord.targetMs, 20);

  // 2. Slow query (25.5ms > 20ms target)
  const slowRecord = logQueryTiming({
    source: "mongodb",
    durationMs: 25.5,
    resultCount: 10,
    origin: [100, 100],
    maxDistance: 100
  });
  assert.equal(slowRecord.targetMet, false, "Must flag query exceeding 20ms");

  const stats = getQueryStats();
  assert.equal(stats.totalQueries, 2);
  assert.equal(stats.slowQueryCount, 1);
  assert.equal(stats.targetMetRate, 50); // 1 out of 2 met target = 50%
  assert.equal(stats.bySource.mongodb.count, 2);
  assert.equal(stats.bySource.mongodb.slowCount, 1);

  resetQueryStats();
});

test("QueryTimer - Maintains ring buffer history and aggregates multi-source statistics", () => {
  resetQueryStats();

  // Log queries from multiple sources
  logQueryTiming({ source: "in-memory", durationMs: 1.5, resultCount: 2 });
  logQueryTiming({ source: "in-memory", durationMs: 2.5, resultCount: 4 });
  logQueryTiming({ source: "mongodb", durationMs: 8.0, resultCount: 5 });

  const stats = getQueryStats();
  assert.equal(stats.totalQueries, 3);
  assert.equal(stats.slowQueryCount, 0);
  assert.equal(stats.targetMetRate, 100);
  assert.equal(stats.minDurationMs, 1.5);
  assert.equal(stats.maxDurationMs, 8.0);
  assert.equal(stats.bySource["in-memory"].count, 2);
  assert.equal(stats.bySource.mongodb.count, 1);

  resetQueryStats();
});

test("getNearbyUsers - Automatically records query timing for in-memory and MongoDB queries", async () => {
  resetQueryStats();

  // 1. In-memory fallback query timing
  const fallbackUsers = [
    { socketId: "peer-a", x: 120, y: 100 },
    { socketId: "peer-b", x: 140, y: 100 }
  ];

  const results = await getNearbyUsers([100, 100], {
    fallbackUsers,
    maxDistance: 100
  });

  assert.equal(results.length, 2);
  const memTiming = getLastQueryTiming();
  assert.ok(memTiming);
  assert.equal(memTiming.source, "in-memory");
  assert.equal(memTiming.resultCount, 2);
  assert.deepEqual(memTiming.origin, [100, 100]);
  assert.equal(memTiming.targetMet, true);

  // 2. MongoDB query timing
  const origFind = Player.find;
  const origReadyState = mongoose.connection.readyState;

  try {
    Object.defineProperty(mongoose.connection, "readyState", {
      value: 1,
      configurable: true,
      writable: true
    });

    Player.find = () => ({
      lean: () => ({
        exec: async () => [
          { playerId: "db-peer-1", position: [110, 100] }
        ]
      })
    });

    const dbResults = await getNearbyUsers([100, 100], { maxDistance: 100 });
    assert.equal(dbResults.length, 1);

    const dbTiming = getLastQueryTiming();
    assert.ok(dbTiming);
    assert.equal(dbTiming.source, "mongodb");
    assert.equal(dbTiming.resultCount, 1);
    assert.equal(dbTiming.targetMet, true);

    const stats = getQueryStats();
    assert.equal(stats.totalQueries, 2);
    assert.equal(stats.bySource["in-memory"].count, 1);
    assert.equal(stats.bySource.mongodb.count, 1);
  } finally {
    Player.find = origFind;
    Object.defineProperty(mongoose.connection, "readyState", {
      value: origReadyState,
      configurable: true,
      writable: true
    });
    resetQueryStats();
  }
});

test("QueryTimer - resetQueryStats clears metrics and history cleanly", () => {
  logQueryTiming({ source: "in-memory", durationMs: 4.0, resultCount: 1 });
  assert.ok(getLastQueryTiming());
  assert.equal(getQueryStats().totalQueries, 1);

  resetQueryStats();

  assert.equal(getLastQueryTiming(), null);
  const cleanStats = getQueryStats();
  assert.equal(cleanStats.totalQueries, 0);
  assert.equal(cleanStats.slowQueryCount, 0);
  assert.equal(cleanStats.targetMetRate, 100);
});

test("SocketHandler - WebRTC signaling relay respects 100px proximity guardrail", async () => {
  resetNearbyMap();
  resetProximityQueues();

  const io = createMockIO();
  setupSocketHandlers(io);

  const socketA = createMockSocket("socket-alice");
  const socketB = createMockSocket("socket-bob");
  const socketC = createMockSocket("socket-charlie");

  try {
    io.emit("connection", socketA);
    io.emit("connection", socketB);
    io.emit("connection", socketC);

    const [joinA] = socketA.listeners("join");
    const [joinB] = socketB.listeners("join");
    const [joinC] = socketC.listeners("join");

    // Alice at (100, 100), Bob at (150, 100) [dist = 50px <= 100px], Charlie at (500, 100) [dist = 400px > 100px]
    await joinA({ username: "Alice", x: 100, y: 100 });
    await joinB({ username: "Bob", x: 150, y: 100 });
    await joinC({ username: "Charlie", x: 500, y: 100 });

    const [offerHandlerA] = socketA.listeners("webrtc:offer");
    const [answerHandlerB] = socketB.listeners("webrtc:answer");
    const [iceHandlerA] = socketA.listeners("webrtc:ice-candidate");

    // 1. Valid relay within 100px: Alice -> Bob
    offerHandlerA({ targetId: "socket-bob", offer: { type: "offer", sdp: "dummy-sdp-offer" } });
    const bobOffers = io.getEmittedTo("socket-bob").filter((e) => e.event === "webrtc:offer");
    assert.equal(bobOffers.length, 1, "Bob should receive offer from Alice within 100px");
    assert.equal(bobOffers[0].data.senderId, "socket-alice");

    answerHandlerB({ targetId: "socket-alice", answer: { type: "answer", sdp: "dummy-sdp-answer" } });
    const aliceAnswers = io.getEmittedTo("socket-alice").filter((e) => e.event === "webrtc:answer");
    assert.equal(aliceAnswers.length, 1, "Alice should receive answer from Bob within 100px");
    assert.equal(aliceAnswers[0].data.senderId, "socket-bob");

    iceHandlerA({ targetId: "socket-bob", candidate: { candidate: "candidate:1" } });
    const bobCandidates = io.getEmittedTo("socket-bob").filter((e) => e.event === "webrtc:ice-candidate");
    assert.equal(bobCandidates.length, 1, "Bob should receive ICE candidate within 100px");

    // 2. Blocked relay outside 100px: Alice -> Charlie (400px apart)
    offerHandlerA({ targetId: "socket-charlie", offer: { type: "offer", sdp: "distant-offer" } });
    const charlieOffers = io.getEmittedTo("socket-charlie").filter((e) => e.event === "webrtc:offer");
    assert.equal(charlieOffers.length, 0, "Charlie (>100px away) must NOT receive webrtc:offer");

    iceHandlerA({ targetId: "socket-charlie", candidate: { candidate: "candidate:2" } });
    const charlieCandidates = io.getEmittedTo("socket-charlie").filter((e) => e.event === "webrtc:ice-candidate");
    assert.equal(charlieCandidates.length, 0, "Charlie (>100px away) must NOT receive webrtc:ice-candidate");
  } finally {
    removeUser("socket-alice");
    removeUser("socket-bob");
    removeUser("socket-charlie");
    resetNearbyMap();
    resetProximityQueues();
  }
});

test("SocketHandler - Enforces lower socket ID offer rule on nearby:enter", async () => {
  resetNearbyMap();
  resetProximityQueues();

  const io = createMockIO();
  setupSocketHandlers(io);

  // 'socket-01-low' is lexicographically lower than 'socket-02-high'
  const socketLow = createMockSocket("socket-01-low");
  const socketHigh = createMockSocket("socket-02-high");

  try {
    io.emit("connection", socketLow);
    io.emit("connection", socketHigh);

    const [joinLow] = socketLow.listeners("join");
    const [joinHigh] = socketHigh.listeners("join");

    await joinLow({ username: "LowID", x: 100, y: 100 });
    // Join within 50px
    await joinHigh({ username: "HighID", x: 150, y: 100 });

    const lowEnters = io.getEmittedTo("socket-01-low").filter((e) => e.event === "nearby:enter");
    const highEnters = socketHigh.emitted.filter((e) => e.event === "nearby:enter");

    assert.equal(lowEnters.length, 1);
    assert.equal(highEnters.length, 1);

    // socket-01-low < socket-02-high -> lower ID must initiate offer
    assert.equal(lowEnters[0].data.shouldInitiateOffer, true, "Lower socket ID must initiate offer");
    assert.equal(highEnters[0].data.shouldInitiateOffer, false, "Higher socket ID must NOT initiate offer");
  } finally {
    removeUser("socket-01-low");
    removeUser("socket-02-high");
    resetNearbyMap();
    resetProximityQueues();
  }
});

