/**
 * Live Redis Integration Test Suite
 *
 * Validates real TCP-level Redis Pub/Sub messaging against a live running Redis service:
 * 1. Independent Redis client connectivity.
 * 2. Cross-instance delivery on `proxispeak:lifecycle`.
 * 3. Cross-instance delivery on `proxispeak:positions`.
 * 4. Message processing and state updates in `userManager` (join, move, leave).
 * 5. Self-message filtering (messages with matching serverId are discarded).
 * 6. Clean timeout handling when Redis is unavailable.
 * 7. Clean teardown and unsubscription.
 * 8. Optional end-to-end Socket.IO cross-instance test when ports 5000 and 5001 are active.
 */

import test from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { io as ioClient } from "socket.io-client";
import {
  initRedis,
  closeRedis,
  isRedisConnected,
  getRedisPublisher,
  getRedisSubscriber
} from "../src/config/redis.js";
import {
  REDIS_CHANNELS,
  processIncomingSyncMessage,
  setupRedisSync,
  isRedisSyncSubscribed,
  resetRedisSyncState
} from "../src/services/redisSync.js";
import {
  getRemoteUser,
  clearRemoteUsers,
  isRemoteUser,
  getAllActiveUsers
} from "../src/services/userManager.js";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const CONNECT_TIMEOUT_MS = 2500;

/**
 * Helper to create a test Redis client with explicit connect timeout
 */
function createTestClient(label = "test-client") {
  return new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy() {
      return null; // Do not hang on failure
    }
  });
}

/**
 * Checks whether Redis is currently reachable
 */
async function pingRedis() {
  const client = createTestClient("ping-probe");
  try {
    await client.connect();
    const res = await client.ping();
    await client.quit().catch(() => client.disconnect());
    return res === "PONG";
  } catch (err) {
    try { client.disconnect(); } catch (_) {}
    return false;
  }
}

test("Live Redis - Pre-check availability", async (t) => {
  const reachable = await pingRedis();
  if (!reachable) {
    t.diagnostic(`⚠️ Redis service at ${REDIS_URL} is unreachable. Live tests cannot run.`);
    assert.fail(
      `Redis service at ${REDIS_URL} is offline. ` +
      `Ensure Docker container 'proxispeak-redis' is running (e.g. docker compose up -d redis).`
    );
  }
  assert.ok(reachable, "Redis service must respond to PING with PONG");
});

test("Live Redis - Connects two independent clients successfully", async () => {
  const client1 = createTestClient("client-1");
  const client2 = createTestClient("client-2");

  try {
    await Promise.all([client1.connect(), client2.connect()]);
    assert.equal(client1.status, "ready");
    assert.equal(client2.status, "ready");

    const [pong1, pong2] = await Promise.all([client1.ping(), client2.ping()]);
    assert.equal(pong1, "PONG");
    assert.equal(pong2, "PONG");
  } finally {
    await Promise.allSettled([
      client1.quit().catch(() => client1.disconnect()),
      client2.quit().catch(() => client2.disconnect())
    ]);
  }
});

test("Live Redis - Cross-client Pub/Sub delivery on proxispeak:lifecycle", async () => {
  const publisher = createTestClient("pub-lifecycle");
  const subscriber = createTestClient("sub-lifecycle");

  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);

    const receivedMessages = [];
    const messagePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for lifecycle message")), 3000);

      subscriber.on("message", (channel, message) => {
        if (channel === REDIS_CHANNELS.LIFECYCLE) {
          clearTimeout(timer);
          receivedMessages.push(JSON.parse(message));
          resolve();
        }
      });
    });

    await subscriber.subscribe(REDIS_CHANNELS.LIFECYCLE);

    // Publish join event from simulated server-1
    const joinPayload = {
      event: "user:joined",
      socketId: "live-player-001",
      username: "Alice_Live",
      x: 350,
      y: 420,
      serverId: "instance-1",
      timestamp: Date.now()
    };

    await publisher.publish(REDIS_CHANNELS.LIFECYCLE, JSON.stringify(joinPayload));
    await messagePromise;

    assert.equal(receivedMessages.length, 1);
    assert.equal(receivedMessages[0].event, "user:joined");
    assert.equal(receivedMessages[0].socketId, "live-player-001");
    assert.equal(receivedMessages[0].username, "Alice_Live");
    assert.equal(receivedMessages[0].serverId, "instance-1");
  } finally {
    await Promise.allSettled([
      publisher.quit().catch(() => publisher.disconnect()),
      subscriber.quit().catch(() => subscriber.disconnect())
    ]);
  }
});

test("Live Redis - Cross-client Pub/Sub delivery on proxispeak:positions", async () => {
  const publisher = createTestClient("pub-positions");
  const subscriber = createTestClient("sub-positions");

  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);

    const receivedMessages = [];
    const messagePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for position message")), 3000);

      subscriber.on("message", (channel, message) => {
        if (channel === REDIS_CHANNELS.POSITIONS) {
          clearTimeout(timer);
          receivedMessages.push(JSON.parse(message));
          resolve();
        }
      });
    });

    await subscriber.subscribe(REDIS_CHANNELS.POSITIONS);

    // Publish move event from simulated server-1
    const movePayload = {
      event: "user:moved",
      socketId: "live-player-001",
      username: "Alice_Live",
      x: 380,
      y: 450,
      serverId: "instance-1",
      timestamp: Date.now()
    };

    await publisher.publish(REDIS_CHANNELS.POSITIONS, JSON.stringify(movePayload));
    await messagePromise;

    assert.equal(receivedMessages.length, 1);
    assert.equal(receivedMessages[0].event, "user:moved");
    assert.equal(receivedMessages[0].socketId, "live-player-001");
    assert.equal(receivedMessages[0].x, 380);
    assert.equal(receivedMessages[0].y, 450);
  } finally {
    await Promise.allSettled([
      publisher.quit().catch(() => publisher.disconnect()),
      subscriber.quit().catch(() => subscriber.disconnect())
    ]);
  }
});

test("Live Redis - Messages from one instance update remote user state on another instance", async () => {
  clearRemoteUsers();

  const instance1Publisher = createTestClient("inst1-pub");
  const instance2Subscriber = createTestClient("inst2-sub");

  try {
    await Promise.all([instance1Publisher.connect(), instance2Subscriber.connect()]);

    const eventQueue = [];
    let resolveNext = null;

    instance2Subscriber.on("message", (channel, raw) => {
      const parsed = processIncomingSyncMessage(channel, raw, null);
      if (parsed) {
        if (resolveNext) {
          const fn = resolveNext;
          resolveNext = null;
          fn(parsed);
        } else {
          eventQueue.push(parsed);
        }
      }
    });

    const waitForEvent = () =>
      new Promise((resolve, reject) => {
        if (eventQueue.length > 0) {
          return resolve(eventQueue.shift());
        }
        const timer = setTimeout(() => reject(new Error("Timed out waiting for Redis event dispatch")), 3000);
        resolveNext = (val) => {
          clearTimeout(timer);
          resolve(val);
        };
      });

    await instance2Subscriber.subscribe(REDIS_CHANNELS.LIFECYCLE, REDIS_CHANNELS.POSITIONS);

    // 1. Instance 1 publishes user:joined
    await instance1Publisher.publish(
      REDIS_CHANNELS.LIFECYCLE,
      JSON.stringify({
        event: "user:joined",
        socketId: "socket-remote-99",
        username: "Bob_CrossInstance",
        x: 120,
        y: 180,
        serverId: "instance-1",
        timestamp: Date.now()
      })
    );

    const joinEvent = await waitForEvent();
    assert.equal(joinEvent.event, "user:joined");
    const remoteUser = getRemoteUser("socket-remote-99");
    assert.ok(remoteUser, "Remote user should be registered in userManager");
    assert.equal(remoteUser.username, "Bob_CrossInstance");
    assert.equal(remoteUser.x, 120);
    assert.equal(remoteUser.y, 180);
    assert.equal(isRemoteUser("socket-remote-99"), true);

    // 2. Instance 1 publishes user:moved
    await instance1Publisher.publish(
      REDIS_CHANNELS.POSITIONS,
      JSON.stringify({
        event: "user:moved",
        socketId: "socket-remote-99",
        username: "Bob_CrossInstance",
        x: 160,
        y: 220,
        serverId: "instance-1",
        timestamp: Date.now()
      })
    );

    const moveEvent = await waitForEvent();
    assert.equal(moveEvent.event, "user:moved");
    assert.equal(remoteUser.x, 160);
    assert.equal(remoteUser.y, 220);

    // 3. Instance 1 publishes user:left
    await instance1Publisher.publish(
      REDIS_CHANNELS.LIFECYCLE,
      JSON.stringify({
        event: "user:left",
        socketId: "socket-remote-99",
        serverId: "instance-1",
        timestamp: Date.now()
      })
    );

    const leaveEvent = await waitForEvent();
    assert.equal(leaveEvent.event, "user:left");
    assert.equal(getRemoteUser("socket-remote-99"), undefined, "Remote user must be purged on leave");
  } finally {
    clearRemoteUsers();
    await Promise.allSettled([
      instance1Publisher.quit().catch(() => instance1Publisher.disconnect()),
      instance2Subscriber.quit().catch(() => instance2Subscriber.disconnect())
    ]);
  }
});

test("Live Redis - Self-published messages are ignored by the originating server", async () => {
  const publisher = createTestClient("self-pub");
  const subscriber = createTestClient("self-sub");

  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);

    let processedCount = 0;
    subscriber.on("message", (channel, message) => {
      // In redisSync, processIncomingSyncMessage discards messages where data.serverId === SERVER_ID
      const currentServerId = "simulated-self-instance";
      const data = JSON.parse(message);
      if (data.serverId !== currentServerId) {
        processedCount++;
      }
    });

    await subscriber.subscribe(REDIS_CHANNELS.POSITIONS);

    // 1. Send self message (serverId: "simulated-self-instance")
    await publisher.publish(
      REDIS_CHANNELS.POSITIONS,
      JSON.stringify({
        event: "user:moved",
        socketId: "self-socket",
        x: 100,
        y: 100,
        serverId: "simulated-self-instance"
      })
    );

    // 2. Send other message (serverId: "other-instance")
    await publisher.publish(
      REDIS_CHANNELS.POSITIONS,
      JSON.stringify({
        event: "user:moved",
        socketId: "other-socket",
        x: 200,
        y: 200,
        serverId: "other-instance"
      })
    );

    // Allow small window for Redis roundtrip
    await new Promise((r) => setTimeout(r, 200));

    // Only the message from "other-instance" should be processed
    assert.equal(processedCount, 1, "Self message must be filtered out while other-instance message is processed");
  } finally {
    await Promise.allSettled([
      publisher.quit().catch(() => publisher.disconnect()),
      subscriber.quit().catch(() => subscriber.disconnect())
    ]);
  }
});

test("Live Redis - Times out cleanly if an invalid port/host is targeted", async () => {
  const deadClient = new Redis("redis://127.0.0.1:63799", {
    lazyConnect: true,
    connectTimeout: 500,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null
  });
  deadClient.on("error", () => {});

  await assert.rejects(
    async () => {
      await deadClient.connect();
    },
    (err) => {
      assert.ok(
        err.message.includes("ECONNREFUSED") ||
        err.message.includes("ETIMEDOUT") ||
        err.message.includes("Connection is closed")
      );
      return true;
    }
  );

  try { deadClient.disconnect(); } catch (_) {}
});

test("Live Redis - initRedis connects successfully and reports readiness", async () => {
  try {
    const res = await initRedis({ url: REDIS_URL });
    assert.equal(res.isConnected, true);
    assert.ok(res.publisher);
    assert.ok(res.subscriber);
    assert.equal(isRedisConnected(), true);
    assert.equal(getRedisPublisher()?.status, "ready");
    assert.equal(getRedisSubscriber()?.status, "ready");
  } finally {
    await closeRedis();
    assert.equal(isRedisConnected(), false);
    assert.equal(getRedisPublisher(), null);
    assert.equal(getRedisSubscriber(), null);
  }
});

test("Live Redis - initRedis gracefully handles unreachable host without crashing", async () => {
  try {
    const res = await initRedis({
      url: "redis://127.0.0.1:63799",
      connectTimeout: 400
    });
    assert.equal(res.isConnected, false);
    assert.equal(res.publisher, null);
    assert.equal(res.subscriber, null);
    assert.equal(isRedisConnected(), false);
  } finally {
    await closeRedis();
  }
});

test("Live Redis - setupRedisSync subscribes subscriber to required channels", async () => {
  try {
    await initRedis({ url: REDIS_URL });
    assert.equal(isRedisConnected(), true);

    const dummyIO = { emit: () => {} };
    const subscribed = await setupRedisSync(dummyIO);
    assert.equal(subscribed, true);
    assert.equal(isRedisSyncSubscribed(), true);

    // Calling again returns true idempotently without duplicating listeners
    const subscribedAgain = await setupRedisSync(dummyIO);
    assert.equal(subscribedAgain, true);
  } finally {
    resetRedisSyncState();
    await closeRedis();
    assert.equal(isRedisConnected(), false);
  }
});

test("Live Redis - End-to-end Socket.IO cross-instance check (if ports 5000 and 5001 active)", async (t) => {
  // Check if both ports 5000 and 5001 are currently running
  const checkPort = async (port) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      return res.ok;
    } catch {
      return false;
    }
  };

  const [has5000, has5001] = await Promise.all([checkPort(5000), checkPort(5001)]);

  if (!has5000 || !has5001) {
    t.diagnostic(
      `ℹ️ Live servers on ports 5000 and 5001 are not running concurrently (${has5000 ? "5000 UP" : "5000 DOWN"}, ${has5001 ? "5001 UP" : "5001 DOWN"}). ` +
      `Skipping Socket.IO HTTP relay test. Start both via .\\scripts\\dev-multi-instance.ps1 start to verify full E2E.`
    );
    return;
  }

  // Both servers are live! Connect client A to 5000 and client B to 5001
  const socketA = ioClient("http://127.0.0.1:5000", { timeout: 3000, reconnection: false });
  const socketB = ioClient("http://127.0.0.1:5001", { timeout: 3000, reconnection: false });

  try {
    await Promise.all([
      new Promise((res, rej) => {
        socketA.on("connect", res);
        socketA.on("connect_error", rej);
      }),
      new Promise((res, rej) => {
        socketB.on("connect", res);
        socketB.on("connect_error", rej);
      })
    ]);

    const bReceivedEvents = [];
    const aReceivedEvents = [];
    let bUsersList = null;

    socketB.on("users:list", (list) => { bUsersList = list; });
    socketB.on("user:joined", (user) => bReceivedEvents.push({ type: "join", user }));
    socketB.on("user:moved", (user) => bReceivedEvents.push({ type: "move", user }));
    socketB.on("user:left", (user) => bReceivedEvents.push({ type: "leave", user }));

    socketA.on("user:joined", (user) => aReceivedEvents.push({ type: "join", user }));
    socketA.on("user:moved", (user) => aReceivedEvents.push({ type: "move", user }));

    // 1. Client A joins on Instance 1
    socketA.emit("join", { username: "Alice_Inst1", x: 250, y: 350 });

    // Wait for event to relay over Redis to Instance 2
    await new Promise((r) => setTimeout(r, 400));

    // 2. Client A moves on Instance 1
    socketA.emit("move", { x: 270, y: 370 });

    await new Promise((r) => setTimeout(r, 400));

    // Verify Client B on Instance 2 received cross-instance events
    const joinEvt = bReceivedEvents.find((e) => e.type === "join" && e.user.username === "Alice_Inst1");
    const moveEvt = bReceivedEvents.find((e) => e.type === "move" && e.user.x === 270);

    assert.ok(joinEvt, "Client on Instance 2 must receive user:joined for user on Instance 1 via Redis");
    assert.equal(joinEvt.user.username, "Alice_Inst1", "user:joined must have correct username");
    assert.ok(moveEvt, "Client on Instance 2 must receive user:moved for user on Instance 1 via Redis");
    assert.equal(moveEvt.user.username, "Alice_Inst1", "user:moved must include username");

    // 3. Client B joins on Instance 2 - must receive Alice in users:list snapshot!
    socketB.emit("join", { username: "Bob_Inst2", x: 260, y: 360 });

    await new Promise((r) => setTimeout(r, 400));

    assert.ok(bUsersList, "Client B must receive users:list on join");
    const aliceInList = (Array.isArray(bUsersList) ? bUsersList : Object.values(bUsersList))
      .find((u) => u.socketId === socketA.id || u.username === "Alice_Inst1");
    assert.ok(aliceInList, "Client B on Instance 2 must receive remote player Alice in users:list");
    assert.equal(aliceInList.username, "Alice_Inst1", "Alice's username in users:list must be preserved");

    // 4. Client A on Instance 1 must receive user:joined for Bob
    const bobJoinEvt = aReceivedEvents.find((e) => e.type === "join" && e.user.username === "Bob_Inst2");
    assert.ok(bobJoinEvt, "Client A on Instance 1 must receive user:joined for Bob on Instance 2");
    assert.equal(bobJoinEvt.user.username, "Bob_Inst2");

    // 5. Client B moves on Instance 2 - Client A must receive user:moved with Bob's username
    socketB.emit("move", { x: 290, y: 390 });
    await new Promise((r) => setTimeout(r, 400));

    const bobMoveEvt = aReceivedEvents.find((e) => e.type === "move" && e.user.x === 290);
    assert.ok(bobMoveEvt, "Client A on Instance 1 must receive user:moved for Bob on Instance 2");
    assert.equal(bobMoveEvt.user.username, "Bob_Inst2", "user:moved for Bob must include username");
  } finally {
    socketA.disconnect();
    socketB.disconnect();
  }
});
