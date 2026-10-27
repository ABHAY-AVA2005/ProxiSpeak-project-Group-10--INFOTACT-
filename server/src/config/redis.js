import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let publisher = null;
let subscriber = null;
let isConnected = false;
let isInitialized = false;

/**
 * Default Redis configuration
 */
export const REDIS_CONFIG = Object.freeze({
  URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  ENABLED: process.env.REDIS_ENABLED !== "false",
  CONNECT_TIMEOUT_MS: 3000,
  MAX_RECONNECT_RETRIES: 3
});

/**
 * Initializes Redis publisher and subscriber clients.
 * Handles offline / connection failure gracefully without crashing the server process.
 *
 * @param {object} [customOptions] - Optional configuration overrides (e.g. for testing)
 * @returns {Promise<{ publisher: Redis|null, subscriber: Redis|null, isConnected: boolean }>}
 */
export async function initRedis(customOptions = {}) {
  if (isInitialized && publisher && subscriber) {
    return { publisher, subscriber, isConnected };
  }

  const enabled = customOptions.enabled ?? REDIS_CONFIG.ENABLED;
  const url = customOptions.url ?? REDIS_CONFIG.URL;

  if (!enabled) {
    console.log("[Redis] Redis scaling is disabled via REDIS_ENABLED=false");
    isInitialized = true;
    return { publisher: null, subscriber: null, isConnected: false };
  }

  const clientOptions = {
    lazyConnect: true,
    connectTimeout: customOptions.connectTimeout ?? REDIS_CONFIG.CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > REDIS_CONFIG.MAX_RECONNECT_RETRIES) {
        // Stop retrying after maximum attempts to prevent spamming logs
        return null;
      }
      return Math.min(times * 500, 2000);
    },
    ...customOptions
  };

  try {
    publisher = new Redis(url, clientOptions);
    subscriber = new Redis(url, clientOptions);

    // Attach defensive error handlers to prevent unhandled error event exceptions
    publisher.on("error", (err) => {
      isConnected = false;
      // Only log once or on non-connection errors to avoid log spam
      if (err.code !== "ECONNREFUSED" && err.code !== "ETIMEDOUT") {
        console.warn("[Redis Publisher Error]", err.message);
      }
    });

    subscriber.on("error", (err) => {
      isConnected = false;
      if (err.code !== "ECONNREFUSED" && err.code !== "ETIMEDOUT") {
        console.warn("[Redis Subscriber Error]", err.message);
      }
    });

    publisher.on("ready", () => {
      isConnected = true;
      console.log("[Redis] Publisher connected and ready");
    });

    subscriber.on("ready", () => {
      console.log("[Redis] Subscriber connected and ready");
    });

    publisher.on("close", () => {
      isConnected = false;
    });

    // Attempt initial connection asynchronously with timeout
    await Promise.all([
      publisher.connect(),
      subscriber.connect()
    ]);

    isConnected = true;
    isInitialized = true;
    console.log(`[Redis] Connected successfully to ${url}`);
  } catch (err) {
    isConnected = false;
    isInitialized = true;
    console.warn(`[Redis] Connection to ${url} unavailable (${err.message}). Operating in standalone single-instance mode.`);
  }

  return { publisher, subscriber, isConnected };
}

/**
 * Returns the active Redis publisher client instance
 * @returns {Redis|null}
 */
export function getRedisPublisher() {
  return publisher;
}

/**
 * Returns the active Redis subscriber client instance
 * @returns {Redis|null}
 */
export function getRedisSubscriber() {
  return subscriber;
}

/**
 * Checks whether Redis is currently connected and ready
 * @returns {boolean}
 */
export function isRedisConnected() {
  return isConnected && publisher?.status === "ready" && subscriber?.status === "ready";
}

/**
 * Closes active Redis connections cleanly (useful for tests and graceful shutdown)
 */
export async function closeRedis() {
  const closePromises = [];

  if (publisher) {
    closePromises.push(
      publisher.quit().catch(() => {
        try { publisher.disconnect(); } catch (_) {}
      })
    );
  }

  if (subscriber) {
    closePromises.push(
      subscriber.quit().catch(() => {
        try { subscriber.disconnect(); } catch (_) {}
      })
    );
  }

  await Promise.all(closePromises);
  publisher = null;
  subscriber = null;
  isConnected = false;
  isInitialized = false;
}
