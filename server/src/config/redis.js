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
  URL: (process.env.REDIS_URL && process.env.REDIS_URL.trim()) || "redis://127.0.0.1:6379",
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
  if (isInitialized && publisher && subscriber && isRedisConnected()) {
    return { publisher, subscriber, isConnected: true };
  }

  const enabled = customOptions.enabled ?? REDIS_CONFIG.ENABLED;
  const url = (customOptions.url && String(customOptions.url).trim()) || REDIS_CONFIG.URL;

  if (!enabled) {
    console.log("[Redis] Redis scaling is disabled via REDIS_ENABLED=false");
    isInitialized = true;
    isConnected = false;
    return { publisher: null, subscriber: null, isConnected: false };
  }

  // If previous instances exist but are not connected, clean them up first
  if (publisher || subscriber) {
    await closeRedis();
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

  let lastPublisherError = null;
  let lastSubscriberError = null;

  try {
    publisher = new Redis(url, clientOptions);
    subscriber = new Redis(url, clientOptions);

    // Attach defensive error handlers to capture diagnostic error details
    publisher.on("error", (err) => {
      lastPublisherError = err;
      isConnected = isRedisConnected();
      const codeMsg = err.code ? `[${err.code}] ` : "";
      console.warn(`[Redis Publisher Error] ${codeMsg}${err.message}`);
    });

    subscriber.on("error", (err) => {
      lastSubscriberError = err;
      isConnected = isRedisConnected();
      const codeMsg = err.code ? `[${err.code}] ` : "";
      console.warn(`[Redis Subscriber Error] ${codeMsg}${err.message}`);
    });

    publisher.on("ready", () => {
      isConnected = isRedisConnected();
      console.log("[Redis] Publisher connected and ready");
    });

    subscriber.on("ready", () => {
      isConnected = isRedisConnected();
      console.log("[Redis] Subscriber connected and ready");
    });

    publisher.on("close", () => {
      isConnected = false;
    });

    subscriber.on("close", () => {
      isConnected = false;
    });

    publisher.on("end", () => {
      isConnected = false;
    });

    subscriber.on("end", () => {
      isConnected = false;
    });

    // Attempt initial connection asynchronously with timeout
    await Promise.all([
      publisher.connect(),
      subscriber.connect()
    ]);

    isConnected = isRedisConnected();
    isInitialized = true;
    console.log(`[Redis] Connected successfully to ${url}`);
    return { publisher, subscriber, isConnected: true };
  } catch (err) {
    // Preserve exact diagnostic details from underlying network errors
    const underlying = lastPublisherError || lastSubscriberError;
    const detail = underlying
      ? `${underlying.code ? underlying.code + ": " : ""}${underlying.message}`
      : err.message;

    isConnected = false;
    isInitialized = true;
    console.warn(`[Redis] Connection to ${url} unavailable (${detail}). Operating in standalone single-instance mode.`);

    // Safely tear down failed clients to prevent unhandled background retry attempts
    try {
      if (publisher) { publisher.disconnect(); }
      if (subscriber) { subscriber.disconnect(); }
    } catch (_) {}

    publisher = null;
    subscriber = null;

    return { publisher: null, subscriber: null, isConnected: false };
  }
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
  return Boolean(publisher && subscriber && publisher.status === "ready" && subscriber.status === "ready");
}

/**
 * Closes active Redis connections cleanly (useful for tests and graceful shutdown)
 */
export async function closeRedis() {
  const closePromises = [];

  if (publisher) {
    const pub = publisher;
    closePromises.push(
      pub.quit().catch(() => {
        try { pub.disconnect(); } catch (_) {}
      })
    );
  }

  if (subscriber) {
    const sub = subscriber;
    closePromises.push(
      sub.quit().catch(() => {
        try { sub.disconnect(); } catch (_) {}
      })
    );
  }

  publisher = null;
  subscriber = null;
  isConnected = false;
  isInitialized = false;

  await Promise.allSettled(closePromises);
}
