/**
 * Redis Pub/Sub Synchronization and Cross-Instance Proximity Tests
 *
 * NOTE ON TESTING LIMITATIONS:
 * In this local environment, Docker is unavailable and no Redis daemon is running on port 6379.
 * This test suite validates Pub/Sub payload contract serialization, server-ID deduplication,
 * remote user lifecycle transitions in `userManager`, and cross-instance proximity diff calculations.
 * It does NOT test live Redis TCP socket I/O, network packet transit, cluster failover, or
 * Redis-side memory benchmarks, which must be verified against a live Redis instance
 * (e.g. via `docker compose up -d redis`).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  SERVER_ID,
  REDIS_CHANNELS,
  processIncomingSyncMessage,
  publishUserPosition,
  publishUserJoin,
  publishUserLeave,
  publishWebRTCSignal,
  publishProximityEnter,
  publishProximityLeave
} from "../src/services/redisSync.js";
import {
  addRemoteUser,
  getRemoteUser,
  updateRemoteUserPosition,
  removeRemoteUser,
  getAllActiveUsers,
  isRemoteUser,
  isLocalUser,
  clearRemoteUsers,
  addUser,
  removeUser
} from "../src/services/userManager.js";
import {
  getNearbyUsersInMemory,
  updateProximity,
  userNearbyMap,
  resetNearbyMap
} from "../src/services/persistenceManager.js";

function createMockIO() {
  const io = new EventEmitter();
  io.emitted = [];
  io.emit = (event, data) => {
    io.emitted.push({ event, data });
  };
  io.to = (targetId) => ({
    emit: (event, data) => {
      io.emitted.push({ targetId, event, data });
    }
  });
  return io;
}

test("RedisSync - Constants and unique server instance identifier", () => {
  assert.ok(SERVER_ID, "SERVER_ID must be defined");
  assert.equal(typeof SERVER_ID, "string");
  assert.ok(SERVER_ID.length > 0);

  assert.equal(REDIS_CHANNELS.POSITIONS, "proxispeak:positions");
  assert.equal(REDIS_CHANNELS.LIFECYCLE, "proxispeak:lifecycle");
  assert.equal(REDIS_CHANNELS.SIGNALING, "proxispeak:signaling");
});

test("RedisSync - processIncomingSyncMessage discards malformed JSON and self-messages", () => {
  const io = createMockIO();

  // Malformed JSON
  assert.equal(processIncomingSyncMessage(REDIS_CHANNELS.POSITIONS, "{invalid-json}", io), null);
  assert.equal(io.emitted.length, 0);

  // Null or empty payload
  assert.equal(processIncomingSyncMessage(REDIS_CHANNELS.POSITIONS, null, io), null);

  // Self-published message (same serverId) must be discarded to prevent infinite echo
  const selfMessage = JSON.stringify({
    event: "user:moved",
    socketId: "socket-self",
    x: 100,
    y: 100,
    serverId: SERVER_ID
  });
  assert.equal(processIncomingSyncMessage(REDIS_CHANNELS.POSITIONS, selfMessage, io), null);
  assert.equal(io.emitted.length, 0, "Self messages must not be re-broadcasted");
});

test("RedisSync - Synchronizes remote user lifecycle (join, move, leave)", () => {
  clearRemoteUsers();
  const io = createMockIO();

  const remoteServerId = "server-remote-02";

  // 1. Remote user joins
  const joinMsg = JSON.stringify({
    event: "user:joined",
    socketId: "remote-bob",
    username: "Bob_Remote",
    x: 150,
    y: 200,
    serverId: remoteServerId
  });

  const joinResult = processIncomingSyncMessage(REDIS_CHANNELS.LIFECYCLE, joinMsg, io);
  assert.ok(joinResult);
  assert.equal(joinResult.event, "user:joined");

  const remoteBob = getRemoteUser("remote-bob");
  assert.ok(remoteBob, "Bob must be registered in remoteUsers store");
  assert.equal(remoteBob.username, "Bob_Remote");
  assert.equal(remoteBob.x, 150);
  assert.equal(remoteBob.y, 200);
  assert.equal(isRemoteUser("remote-bob"), true);
  assert.equal(isLocalUser("remote-bob"), false);

  assert.equal(io.emitted.length, 1);
  assert.equal(io.emitted[0].event, "user:joined");
  assert.equal(io.emitted[0].data.socketId, "remote-bob");

  // 2. Remote user moves
  const moveMsg = JSON.stringify({
    event: "user:moved",
    socketId: "remote-bob",
    username: "Bob_Remote",
    x: 160,
    y: 210,
    serverId: remoteServerId
  });

  const moveResult = processIncomingSyncMessage(REDIS_CHANNELS.POSITIONS, moveMsg, io);
  assert.ok(moveResult);
  assert.equal(remoteBob.x, 160);
  assert.equal(remoteBob.y, 210);

  assert.equal(io.emitted.length, 2);
  assert.equal(io.emitted[1].event, "user:moved");
  assert.equal(io.emitted[1].data.x, 160);
  assert.equal(io.emitted[1].data.username, "Bob_Remote");

  // 3. Remote user leaves
  const leaveMsg = JSON.stringify({
    event: "user:left",
    socketId: "remote-bob",
    serverId: remoteServerId
  });

  const leaveResult = processIncomingSyncMessage(REDIS_CHANNELS.LIFECYCLE, leaveMsg, io);
  assert.ok(leaveResult);
  assert.equal(getRemoteUser("remote-bob"), undefined, "Bob must be removed from remoteUsers store");
  assert.equal(isRemoteUser("remote-bob"), false);

  assert.equal(io.emitted.length, 3);
  assert.equal(io.emitted[2].event, "user:left");
  assert.equal(io.emitted[2].data.socketId, "remote-bob");

  clearRemoteUsers();
});

test("RedisSync - Cross-instance proximity detects remote users within 100px", async () => {
  clearRemoteUsers();
  resetNearbyMap();

  try {
    // Local user Alice on Instance 1 at (100, 100)
    const alice = addUser("socket-alice", "Alice", 100, 100);

    // Remote user Bob on Instance 2 at (140, 100) [dist = 40px <= 100px]
    addRemoteUser("remote-bob", "Bob", 140, 100, "instance-2");

    // Remote user Charlie on Instance 2 at (500, 100) [dist = 400px > 100px]
    addRemoteUser("remote-charlie", "Charlie", 500, 100, "instance-2");

    // Combined active users must include all 3
    const allActive = getAllActiveUsers();
    assert.equal(allActive.length, 3);

    // In-memory proximity query from Alice (100, 100)
    const nearby = await getNearbyUsersInMemory([100, 100], {
      excludePlayerId: "socket-alice"
    });

    assert.equal(nearby.length, 1, "Only Bob should be detected in 100px earshot");
    assert.equal(nearby[0].socketId, "remote-bob");
    assert.equal(nearby[0].username, "Bob");

    // Proximity enter diff
    const diff = updateProximity("socket-alice", alice, nearby);
    assert.equal(diff.entered.length, 1);
    assert.equal(diff.entered[0].socketId, "remote-bob");
  } finally {
    removeUser("socket-alice");
    clearRemoteUsers();
    resetNearbyMap();
  }
});

test("RedisSync - Publishing helpers fail safely and gracefully when Redis is offline", async () => {
  // Verifies that publishing when Redis is disconnected does not throw uncaught exceptions
  await assert.doesNotReject(async () => {
    await publishUserPosition({ socketId: "s1", username: "U1", x: 100, y: 100 });
    await publishUserJoin({ socketId: "s1", username: "U1", x: 100, y: 100 });
    await publishUserLeave("s1");
    await publishWebRTCSignal({ event: "webrtc:offer", targetId: "s1", senderId: "s2", offer: {} });
    await publishProximityEnter({ targetId: "s1", peer: { socketId: "s2" } });
    await publishProximityLeave({ targetId: "s1", peerId: "s2" });
    // Invalid inputs
    await publishUserPosition(null);
    await publishUserJoin(null);
    await publishUserLeave(null);
    await publishWebRTCSignal(null);
    await publishProximityEnter({});
    await publishProximityLeave({});
  });
});

test("RedisSync - Dispatches incoming webrtc:offer, webrtc:answer, and webrtc:ice-candidate over SIGNALING channel", () => {
  const io = createMockIO();
  addUser("socket-local-alice", "Alice", 100, 100);

  try {
    // 1. Incoming offer for local Alice from remote Bob
    const offerMsg = JSON.stringify({
      event: "webrtc:offer",
      targetId: "socket-local-alice",
      senderId: "remote-bob",
      offer: { type: "offer", sdp: "dummy-offer-sdp" },
      serverId: "server-remote-02"
    });

    const offerResult = processIncomingSyncMessage(REDIS_CHANNELS.SIGNALING, offerMsg, io);
    assert.ok(offerResult);
    assert.equal(io.emitted.length, 1);
    assert.equal(io.emitted[0].targetId, "socket-local-alice");
    assert.equal(io.emitted[0].event, "webrtc:offer");
    assert.equal(io.emitted[0].data.senderId, "remote-bob");
    assert.equal(io.emitted[0].data.offer.sdp, "dummy-offer-sdp");

    // 2. Incoming answer for local Alice from remote Bob
    const answerMsg = JSON.stringify({
      event: "webrtc:answer",
      targetId: "socket-local-alice",
      senderId: "remote-bob",
      answer: { type: "answer", sdp: "dummy-answer-sdp" },
      serverId: "server-remote-02"
    });

    const answerResult = processIncomingSyncMessage(REDIS_CHANNELS.SIGNALING, answerMsg, io);
    assert.ok(answerResult);
    assert.equal(io.emitted.length, 2);
    assert.equal(io.emitted[1].targetId, "socket-local-alice");
    assert.equal(io.emitted[1].event, "webrtc:answer");
    assert.equal(io.emitted[1].data.senderId, "remote-bob");
    assert.equal(io.emitted[1].data.answer.sdp, "dummy-answer-sdp");

    // 3. Incoming ICE candidate for local Alice from remote Bob
    const iceMsg = JSON.stringify({
      event: "webrtc:ice-candidate",
      targetId: "socket-local-alice",
      senderId: "remote-bob",
      candidate: { candidate: "candidate:1", sdpMid: "0" },
      serverId: "server-remote-02"
    });

    const iceResult = processIncomingSyncMessage(REDIS_CHANNELS.SIGNALING, iceMsg, io);
    assert.ok(iceResult);
    assert.equal(io.emitted.length, 3);
    assert.equal(io.emitted[2].targetId, "socket-local-alice");
    assert.equal(io.emitted[2].event, "webrtc:ice-candidate");
    assert.equal(io.emitted[2].data.senderId, "remote-bob");
    assert.equal(io.emitted[2].data.candidate.candidate, "candidate:1");
  } finally {
    removeUser("socket-local-alice");
  }
});

test("RedisSync - Dispatches incoming proximity:enter and proximity:leave, updating local userNearbyMap", () => {
  const io = createMockIO();
  addUser("socket-local-alice", "Alice", 100, 100);
  resetNearbyMap();

  try {
    // 1. Proximity enter from remote instance
    const enterMsg = JSON.stringify({
      event: "proximity:enter",
      targetId: "socket-local-alice",
      peer: {
        socketId: "remote-bob",
        id: "remote-bob",
        username: "Bob",
        x: 140,
        y: 100,
        shouldInitiateOffer: true
      },
      serverId: "server-remote-02"
    });

    const enterResult = processIncomingSyncMessage(REDIS_CHANNELS.SIGNALING, enterMsg, io);
    assert.ok(enterResult);

    // Assert userNearbyMap updated
    const aliceNearby = userNearbyMap.get("socket-local-alice");
    assert.ok(aliceNearby, "Alice must have a proximity set in userNearbyMap");
    assert.ok(aliceNearby.has("remote-bob"), "remote-bob must be in Alice's proximity set");

    // Assert nearby:enter was emitted to local Alice
    assert.equal(io.emitted.length, 1);
    assert.equal(io.emitted[0].targetId, "socket-local-alice");
    assert.equal(io.emitted[0].event, "nearby:enter");
    assert.equal(io.emitted[0].data.socketId, "remote-bob");
    assert.equal(io.emitted[0].data.shouldInitiateOffer, true);

    // 2. Proximity leave from remote instance
    const leaveMsg = JSON.stringify({
      event: "proximity:leave",
      targetId: "socket-local-alice",
      peerId: "remote-bob",
      serverId: "server-remote-02"
    });

    const leaveResult = processIncomingSyncMessage(REDIS_CHANNELS.SIGNALING, leaveMsg, io);
    assert.ok(leaveResult);

    // Assert userNearbyMap cleaned up
    assert.equal(aliceNearby.has("remote-bob"), false, "remote-bob must be removed from proximity set");

    // Assert nearby:leave was emitted to local Alice
    assert.equal(io.emitted.length, 2);
    assert.equal(io.emitted[1].targetId, "socket-local-alice");
    assert.equal(io.emitted[1].event, "nearby:leave");
    assert.equal(io.emitted[1].data.socketId, "remote-bob");
  } finally {
    removeUser("socket-local-alice");
    resetNearbyMap();
  }
});

test("RedisSync - Drops SIGNALING messages targeting non-local or unknown sockets", () => {
  const io = createMockIO();

  const unknownMsg = JSON.stringify({
    event: "webrtc:offer",
    targetId: "socket-nonexistent",
    senderId: "remote-bob",
    offer: {},
    serverId: "server-remote-02"
  });

  const result = processIncomingSyncMessage(REDIS_CHANNELS.SIGNALING, unknownMsg, io);
  assert.equal(result, null, "Messages for non-local sockets must be discarded");
  assert.equal(io.emitted.length, 0);
});
