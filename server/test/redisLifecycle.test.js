import test from "node:test";
import assert from "node:assert/strict";
import {
  initRedis,
  closeRedis,
  isRedisConnected,
  getRedisPublisher,
  getRedisSubscriber,
  startRedisAutoReconnect,
  stopRedisAutoReconnect,
  isAutoReconnectActive,
  getPendingClientsCount
} from "../src/config/redis.js";
import {
  setupRedisSync,
  isRedisSyncSubscribed,
  resetRedisSyncState,
  REDIS_CHANNELS
} from "../src/services/redisSync.js";

const VALID_REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const INVALID_REDIS_URL = "redis://127.0.0.1:63799";

const dummyIO = {
  emit: () => {},
  to: () => ({ emit: () => {} })
};

test("Lifecycle Scenario 6: Redis unavailable at startup automatically reconnects in background when available", async () => {
  const originalUrl = process.env.REDIS_URL;
  await closeRedis();

  try {
    // 1. Simulate Redis unavailable at startup
    process.env.REDIS_URL = INVALID_REDIS_URL;
    const offlineRes = await initRedis({ connectTimeout: 300 });

    assert.equal(offlineRes.isConnected, false, "Should report isConnected false on invalid host");
    assert.equal(isRedisConnected(), false, "isRedisConnected() must report false");
    assert.equal(getRedisPublisher(), null, "Publisher client must be null after failed startup");
    assert.equal(getRedisSubscriber(), null, "Subscriber client must be null after failed startup");

    // 2. Start automatic background reconnection
    startRedisAutoReconnect(dummyIO, 100);
    assert.equal(isAutoReconnectActive(), true, "Auto-reconnect timer must be running");

    // 3. Make Redis available (update environment URL)
    process.env.REDIS_URL = VALID_REDIS_URL;

    // 4. Await automatic background reconnection WITHOUT manually calling initRedis()
    const start = Date.now();
    while (!isRedisConnected() && Date.now() - start < 4000) {
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.equal(isRedisConnected(), true, "Background auto-reconnect must reconnect without manually calling initRedis()");
    assert.equal(isRedisSyncSubscribed(), true, "setupRedisSync must be automatically invoked upon background reconnection");
    assert.equal(isAutoReconnectActive(), false, "Auto-reconnect timer must be stopped upon successful reconnection");
    assert.ok(getRedisPublisher(), "Publisher must be an active object");
    assert.ok(getRedisSubscriber(), "Subscriber must be an active object");
    assert.equal(getRedisPublisher().status, "ready");
    assert.equal(getRedisSubscriber().status, "ready");
  } finally {
    process.env.REDIS_URL = originalUrl;
    await closeRedis();
  }
});

test("Lifecycle Scenario 7: Publisher and subscriber disconnections independently drop isRedisConnected", async (t) => {
  await closeRedis();

  await t.test("Publisher disconnection independently causes isRedisConnected to report false", async () => {
    await initRedis({ url: VALID_REDIS_URL });
    assert.equal(isRedisConnected(), true, "Should initially be connected");

    const pub = getRedisPublisher();
    assert.ok(pub);
    pub.disconnect();

    // Allow event loop to process disconnect event
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(isRedisConnected(), false, "isRedisConnected() must return false when publisher disconnects");
    await closeRedis();
  });

  await t.test("Subscriber disconnection independently causes isRedisConnected to report false", async () => {
    await initRedis({ url: VALID_REDIS_URL });
    assert.equal(isRedisConnected(), true, "Should initially be connected");

    const sub = getRedisSubscriber();
    assert.ok(sub);
    sub.disconnect();

    // Allow event loop to process disconnect event
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(isRedisConnected(), false, "isRedisConnected() must return false when subscriber disconnects");
    await closeRedis();
  });

  await t.test("Simultaneous disconnection of both clients causes isRedisConnected to report false", async () => {
    await initRedis({ url: VALID_REDIS_URL });
    assert.equal(isRedisConnected(), true, "Should initially be connected");

    getRedisPublisher().disconnect();
    getRedisSubscriber().disconnect();

    await new Promise((r) => setTimeout(r, 40));

    assert.equal(isRedisConnected(), false, "isRedisConnected() must return false when both disconnect");
    await closeRedis();
  });
});

test("Lifecycle Scenario 8: Redis reconnection reattaches listeners without duplicates and restores Pub/Sub", async () => {
  await closeRedis();

  // 1. Initial connection
  await initRedis({ url: VALID_REDIS_URL });
  assert.equal(isRedisConnected(), true);

  const initialSubscriber = getRedisSubscriber();
  assert.ok(initialSubscriber);
  assert.equal(initialSubscriber.listenerCount("message"), 0, "Initial subscriber has 0 message listeners before sync setup");

  // 2. Initial setupRedisSync attaching listener
  const firstAttached = await setupRedisSync(dummyIO);
  assert.equal(firstAttached, true);
  assert.equal(isRedisSyncSubscribed(), true);
  assert.equal(initialSubscriber.listenerCount("message"), 1, "setupRedisSync should attach exactly 1 message listener");

  // 3. Verify duplicate setupRedisSync calls on same client do not add duplicate listeners
  const duplicateAttached = await setupRedisSync(dummyIO);
  assert.equal(duplicateAttached, true);
  assert.equal(initialSubscriber.listenerCount("message"), 1, "Duplicate setupRedisSync call must not add duplicate listeners");

  // 4. Simulate disconnection and client recreation
  await closeRedis();
  assert.equal(isRedisConnected(), false);
  assert.equal(isRedisSyncSubscribed(), false);

  const reconnected = await initRedis({ url: VALID_REDIS_URL });
  assert.equal(reconnected.isConnected, true);
  assert.equal(isRedisConnected(), true);

  const newSubscriber = getRedisSubscriber();
  assert.notEqual(newSubscriber, initialSubscriber, "Reconnection must create a new subscriber instance");
  assert.equal(newSubscriber.listenerCount("message"), 0, "New subscriber starts with 0 message listeners");

  // 5. Track message dispatch and verify setupRedisSync reattaches to newly created subscriber
  let dispatchedCount = 0;
  const trackingIO = {
    emit: (event, payload) => {
      if (event === "user:moved" && payload?.socketId === "sock-reconnect-test") {
        dispatchedCount++;
      }
    },
    to: () => ({ emit: () => {} })
  };

  const reattached = await setupRedisSync(trackingIO);
  assert.equal(reattached, true, "setupRedisSync should succeed on the newly created subscriber");
  assert.equal(isRedisSyncSubscribed(), true);
  assert.equal(newSubscriber.listenerCount("message"), 1, "Message listener must be reattached to newly created subscriber");

  // 6. Duplicate setupRedisSync on new subscriber must also remain idempotent
  await setupRedisSync(trackingIO);
  assert.equal(newSubscriber.listenerCount("message"), 1, "Second setupRedisSync on new subscriber must not duplicate listeners");

  // 7. Preserve existing Redis Pub/Sub test and verify single dispatch (no duplicates)
  const pub = getRedisPublisher();
  const testPayload = {
    event: "user:moved",
    socketId: "sock-reconnect-test",
    username: "ReconnectTester",
    x: 42,
    y: 84,
    serverId: "srv_test_publisher"
  };

  await pub.publish(REDIS_CHANNELS.POSITIONS, JSON.stringify(testPayload));

  // Await message delivery to trackingIO
  const start = Date.now();
  while (dispatchedCount === 0 && Date.now() - start < 3000) {
    await new Promise((r) => setTimeout(r, 25));
  }

  assert.equal(dispatchedCount, 1, "Subscriber must receive published message with exactly one dispatch (no duplicates)");

  await closeRedis();
});

test("Lifecycle Scenario 9: Graceful shutdown cancels reconnect timer, resets state, and allows clean restart", async () => {
  const originalUrl = process.env.REDIS_URL;
  await closeRedis();

  try {
    // 1. Start in offline mode with active auto-reconnect timer
    process.env.REDIS_URL = INVALID_REDIS_URL;
    await initRedis({ connectTimeout: 300 });
    assert.equal(isRedisConnected(), false);

    startRedisAutoReconnect(dummyIO, 200);
    assert.equal(isAutoReconnectActive(), true, "Reconnect timer must be active when disconnected");

    // 2. Graceful shutdown via closeRedis()
    await closeRedis();

    assert.equal(isAutoReconnectActive(), false, "closeRedis() must cancel the active reconnect timer");
    assert.equal(isRedisConnected(), false, "isRedisConnected() must be false after shutdown");
    assert.equal(getRedisPublisher(), null, "Publisher client must be null after shutdown");
    assert.equal(getRedisSubscriber(), null, "Subscriber client must be null after shutdown");
    assert.equal(isRedisSyncSubscribed(), false, "isRedisSyncSubscribed() must be false after shutdown");

    // 3. Confirm startRedisAutoReconnect does NOT start timers when isShutdown is true
    startRedisAutoReconnect(dummyIO, 200);
    assert.equal(isAutoReconnectActive(), false, "startRedisAutoReconnect must not start timer after shutdown");

    // 4. Verify clean restart works correctly after shutdown
    process.env.REDIS_URL = VALID_REDIS_URL;
    const restartRes = await initRedis({ url: VALID_REDIS_URL });

    assert.equal(restartRes.isConnected, true, "initRedis must successfully re-establish connection after shutdown");
    assert.equal(isRedisConnected(), true, "isRedisConnected() must report true after restart");
    assert.ok(getRedisPublisher(), "Publisher client must be active after restart");
    assert.ok(getRedisSubscriber(), "Subscriber client must be active after restart");
    assert.equal(getRedisPublisher().status, "ready");
    assert.equal(getRedisSubscriber().status, "ready");

    // 5. Verify synchronization attaches cleanly after restart
    const syncAttached = await setupRedisSync(dummyIO);
    assert.equal(syncAttached, true, "setupRedisSync should succeed after restart");
    assert.equal(isRedisSyncSubscribed(), true);
  } finally {
    process.env.REDIS_URL = originalUrl;
    await closeRedis();
    assert.equal(isRedisConnected(), false);
  }
});

test("Lifecycle Scenario 10: Shutdown during an in-flight Redis initialization", async () => {
  await closeRedis();

  // 1. Start a Redis initialization attempt (do not await immediately)
  const inFlightInitPromise = initRedis({ url: VALID_REDIS_URL });

  // 2. Trigger closeRedis() while the initialization attempt is in flight
  const closePromise = closeRedis();

  // 3. Allow both pending operations to settle
  const [initResult] = await Promise.all([inFlightInitPromise, closePromise]);

  // 4. Verify that isRedisConnected() remains false
  assert.equal(isRedisConnected(), false, "isRedisConnected() must remain false after shutdown during in-flight init");
  assert.equal(initResult.isConnected, false, "in-flight init result must report isConnected: false");

  // 5. Verify that getRedisPublisher() returns null
  assert.equal(getRedisPublisher(), null, "getRedisPublisher() must return null after shutdown during in-flight init");

  // 6. Verify that getRedisSubscriber() returns null
  assert.equal(getRedisSubscriber(), null, "getRedisSubscriber() must return null after shutdown during in-flight init");

  // 7. Verify that no pending Redis clients survive shutdown
  assert.equal(getPendingClientsCount(), 0, "No pending Redis clients should survive shutdown");

  // 8. Verify that no automatic reconnect timer starts after shutdown
  assert.equal(isAutoReconnectActive(), false, "No automatic reconnect timer should be running after shutdown");

  // 9. Verify that a subsequent explicit initRedis() can successfully restart Redis
  const restartRes = await initRedis({ url: VALID_REDIS_URL });
  assert.equal(restartRes.isConnected, true, "Subsequent explicit initRedis() must successfully restart Redis");
  assert.equal(isRedisConnected(), true, "isRedisConnected() must report true after restart");
  assert.ok(getRedisPublisher(), "Publisher must be an active client after restart");
  assert.ok(getRedisSubscriber(), "Subscriber must be an active client after restart");
  assert.equal(getRedisPublisher().status, "ready");
  assert.equal(getRedisSubscriber().status, "ready");
  assert.equal(getPendingClientsCount(), 0, "No pending clients remain after successful restart");

  // Verify synchronization attaches cleanly after restart
  const syncAttached = await setupRedisSync(dummyIO);
  assert.equal(syncAttached, true, "setupRedisSync should succeed on restarted connection");
  assert.equal(isRedisSyncSubscribed(), true);

  // Teardown
  await closeRedis();
  assert.equal(isRedisConnected(), false);
  assert.equal(getPendingClientsCount(), 0);
});
