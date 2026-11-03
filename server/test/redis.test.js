import test from "node:test";
import assert from "node:assert/strict";
import { setupRedisAdapter, isRedisConnected, closeRedisConnection } from "../src/config/redis.js";

test("Redis Adapter - Gracefully falls back to in-memory mode when REDIS_URL is not set", async () => {
  const previousUrl = process.env.REDIS_URL;
  delete process.env.REDIS_URL;
  delete process.env.REDIS_URI;

  let adapterAssigned = false;
  const mockIo = {
    adapter: () => {
      adapterAssigned = true;
    }
  };

  const attached = await setupRedisAdapter(mockIo);
  assert.equal(attached, false, "Should return false when REDIS_URL is absent");
  assert.equal(isRedisConnected(), false, "isRedisConnected should report false");
  assert.equal(adapterAssigned, false, "io.adapter should not be invoked when Redis is unconfigured");

  // Restore env if any
  if (previousUrl) {
    process.env.REDIS_URL = previousUrl;
  }
});

test("Redis Adapter - Closes cleanly even if inactive", async () => {
  await assert.doesNotReject(async () => {
    await closeRedisConnection();
  });
  assert.equal(isRedisConnected(), false);
});
