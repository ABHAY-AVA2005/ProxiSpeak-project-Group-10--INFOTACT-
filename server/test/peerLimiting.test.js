import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAX_PEERS,
  MIN_MAX_PEERS,
  getConfiguredMaxPeers,
  applyNearestPeerLimit,
  getNearbyUsersInMemory,
  updateProximity,
  userNearbyMap,
  resetNearbyMap
} from "../src/services/persistenceManager.js";
import { addUser, removeUser } from "../src/services/userManager.js";
import { setupSocketHandlers, resetProximityQueues } from "../src/sockets/socketHandler.js";
import { EventEmitter } from "node:events";

function createMockSocket(id) {
  const socket = new EventEmitter();
  socket.id = id;
  socket.connected = true;
  socket.broadcast = new EventEmitter();
  socket.disconnect = () => {
    socket.connected = false;
    socket.emit("disconnect", "transport close");
  };
  return socket;
}

function createMockIO() {
  const io = new EventEmitter();
  const roomEmitters = new Map();

  io.to = (room) => {
    if (!roomEmitters.has(room)) {
      const emitter = {
        emitted: [],
        emit: (event, data) => {
          emitter.emitted.push({ event, data });
        }
      };
      roomEmitters.set(room, emitter);
    }
    return roomEmitters.get(room);
  };

  io.getEmittedTo = (room) => {
    return roomEmitters.get(room)?.emitted || [];
  };

  return io;
}

test("PeerLimiting - getConfiguredMaxPeers bounds configuration between 6 and 8", () => {
  const origEnv = process.env.MAX_PEERS;

  try {
    delete process.env.MAX_PEERS;
    assert.equal(getConfiguredMaxPeers(), 8, "Default MAX_PEERS should be 8");

    process.env.MAX_PEERS = "4";
    assert.equal(getConfiguredMaxPeers(), 6, "MAX_PEERS < 6 must clamp to 6");

    process.env.MAX_PEERS = "7";
    assert.equal(getConfiguredMaxPeers(), 7, "MAX_PEERS=7 must be respected");

    process.env.MAX_PEERS = "15";
    assert.equal(getConfiguredMaxPeers(), 8, "MAX_PEERS > 8 must clamp to 8");

    process.env.MAX_PEERS = "invalid";
    assert.equal(getConfiguredMaxPeers(), 8, "Non-numeric MAX_PEERS must fallback to 8");
  } finally {
    if (origEnv !== undefined) {
      process.env.MAX_PEERS = origEnv;
    } else {
      delete process.env.MAX_PEERS;
    }
  }
});

test("PeerLimiting - applyNearestPeerLimit slices to nearest N peers", () => {
  const candidates = [
    { socketId: "p1", distance: 10 },
    { socketId: "p2", distance: 20 },
    { socketId: "p3", distance: 30 },
    { socketId: "p4", distance: 40 },
    { socketId: "p5", distance: 50 },
    { socketId: "p6", distance: 60 },
    { socketId: "p7", distance: 70 },
    { socketId: "p8", distance: 80 },
    { socketId: "p9", distance: 90 },
    { socketId: "p10", distance: 95 }
  ];

  // Default limit 8
  const defaultCapped = applyNearestPeerLimit(candidates, 8);
  assert.equal(defaultCapped.length, 8);
  assert.equal(defaultCapped[0].socketId, "p1");
  assert.equal(defaultCapped[7].socketId, "p8");

  // Limit 6
  const capped6 = applyNearestPeerLimit(candidates, 6);
  assert.equal(capped6.length, 6);
  assert.equal(capped6[5].socketId, "p6");

  // Bypass with false/null
  assert.equal(applyNearestPeerLimit(candidates, false).length, 10);
  assert.equal(applyNearestPeerLimit(candidates, null).length, 10);

  // Edge cases
  assert.deepEqual(applyNearestPeerLimit([], 8), []);
  assert.deepEqual(applyNearestPeerLimit(null, 8), []);
});

test("PeerLimiting - getNearbyUsersInMemory respects maxPeers option", async () => {
  const origin = [100, 100];
  const candidates = [];
  // Generate 12 users within 100px
  for (let i = 1; i <= 12; i++) {
    candidates.push({
      socketId: `peer-${i}`,
      username: `Peer_${i}`,
      x: 100 + i * 5, // distances: 5, 10, 15, ..., 60px <= 100px
      y: 100
    });
  }

  // Without cap (returns all 12)
  const allNearby = await getNearbyUsersInMemory(origin, { users: candidates, maxPeers: false });
  assert.equal(allNearby.length, 12);

  // With cap 8
  const capped8 = await getNearbyUsersInMemory(origin, { users: candidates, maxPeers: 8 });
  assert.equal(capped8.length, 8);
  assert.equal(capped8[0].socketId, "peer-1");
  assert.equal(capped8[7].socketId, "peer-8");

  // With cap 6
  const capped6 = await getNearbyUsersInMemory(origin, { users: candidates, maxPeers: 6 });
  assert.equal(capped6.length, 6);
  assert.equal(capped6[5].socketId, "peer-6");
});

test("PeerLimiting - updateProximity enforces cap and handles peer eviction diffs", () => {
  resetNearbyMap();

  const userA = { socketId: "user-A", username: "Alice", x: 100, y: 100 };

  // 10 candidate peers sorted closest first
  const peers = [];
  for (let i = 1; i <= 10; i++) {
    peers.push({
      socketId: `peer-${i}`,
      username: `Peer_${i}`,
      x: 100 + i * 8, // distances: 8, 16, 24, ..., 80px <= 100px
      y: 100
    });
  }

  // Initial proximity evaluation with 10 peers, capped at 8
  const initialDiff = updateProximity("user-A", userA, peers, { maxPeers: 8 });
  assert.equal(initialDiff.entered.length, 8, "Only top 8 closest peers should enter");
  assert.equal(initialDiff.left.length, 0);
  assert.equal(initialDiff.entered[0].socketId, "peer-1");
  assert.equal(initialDiff.entered[7].socketId, "peer-8");

  // Verify proximity set size
  const userASet = userNearbyMap.get("user-A");
  assert.equal(userASet.size, 8);
  assert.ok(userASet.has("peer-8"));
  assert.equal(userASet.has("peer-9"), false);
  assert.equal(userASet.has("peer-10"), false);

  // Symmetrical check: peer-8 has user-A, peer-9 does not
  assert.ok(userNearbyMap.get("peer-8").has("user-A"));
  assert.equal(userNearbyMap.get("peer-9")?.has("user-A") ?? false, false);

  // New peer-0 arrives at distance 2px (closer than everyone else)
  const peer0 = { socketId: "peer-0", username: "Peer_0", x: 102, y: 100 };
  const updatedPeers = [peer0, ...peers]; // peer-0 is now closest; peer-8 is now 9th closest

  const secondDiff = updateProximity("user-A", userA, updatedPeers, { maxPeers: 8 });
  assert.equal(secondDiff.entered.length, 1, "Only peer-0 enters");
  assert.equal(secondDiff.entered[0].socketId, "peer-0");
  assert.equal(secondDiff.left.length, 1, "peer-8 displaced and leaves");
  assert.equal(secondDiff.left[0], "peer-8");

  // Verify updated proximity set
  assert.ok(userNearbyMap.get("user-A").has("peer-0"));
  assert.equal(userNearbyMap.get("user-A").has("peer-8"), false);
  assert.equal(userNearbyMap.get("peer-8").has("user-A"), false, "peer-8 symmetrically removed");
  assert.ok(userNearbyMap.get("peer-0").has("user-A"), "peer-0 symmetrically added");

  resetNearbyMap();
});

test("PeerLimiting - Signaling relay blocks peers outside the capped proximity set", async () => {
  resetNearbyMap();
  resetProximityQueues();

  const io = createMockIO();
  setupSocketHandlers(io);

  const socketA = createMockSocket("socket-alice");
  const socketPeers = [];
  for (let i = 1; i <= 9; i++) {
    socketPeers.push(createMockSocket(`socket-p${i}`));
  }

  try {
    io.emit("connection", socketA);
    for (const sp of socketPeers) {
      io.emit("connection", sp);
    }

    const [joinA] = socketA.listeners("join");
    await joinA({ username: "Alice", x: 100, y: 100 });

    // Join 9 peers at distances 10, 20, 30, ... 90px <= 100px
    for (let i = 0; i < 9; i++) {
      const [joinPeer] = socketPeers[i].listeners("join");
      await joinPeer({ username: `P${i + 1}`, x: 100 + (i + 1) * 9, y: 100 });
    }

    // Trigger proximity check for Alice
    const [moveA] = socketA.listeners("move");
    await moveA({ x: 100, y: 100 });

    // Alice should have at most 8 peers in active proximity
    const aliceNearby = userNearbyMap.get("socket-alice");
    assert.ok(aliceNearby, "Alice proximity set must exist");
    assert.ok(aliceNearby.size <= 8, `Alice proximity set (${aliceNearby.size}) must not exceed 8`);

    // P1..P8 are in proximity, P9 is outside the cap
    assert.ok(aliceNearby.has("socket-p1"));
    assert.equal(aliceNearby.has("socket-p9"), false, "9th peer must be excluded by peer cap");

    const [offerHandlerA] = socketA.listeners("webrtc:offer");

    // 1. Offer to capped peer socket-p1 (must succeed)
    offerHandlerA({ targetId: "socket-p1", offer: { type: "offer", sdp: "sdp-p1" } });
    const p1Offers = io.getEmittedTo("socket-p1").filter((e) => e.event === "webrtc:offer");
    assert.equal(p1Offers.length, 1, "Signaling to in-proximity peer must succeed");

    // 2. Offer to 9th peer socket-p9 (must be blocked by peer cap guardrail)
    offerHandlerA({ targetId: "socket-p9", offer: { type: "offer", sdp: "sdp-p9" } });
    const p9Offers = io.getEmittedTo("socket-p9").filter((e) => e.event === "webrtc:offer");
    assert.equal(p9Offers.length, 0, "Signaling to capped peer outside top 8 must be blocked");
  } finally {
    removeUser("socket-alice");
    for (let i = 1; i <= 9; i++) {
      removeUser(`socket-p${i}`);
    }
    resetNearbyMap();
    resetProximityQueues();
  }
});
