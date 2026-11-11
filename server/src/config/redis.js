import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

let publisher = null;
let subscriber = null;
let isConnected = false;
let isInitialized = false;
let isReconnecting = false;
let autoReconnectTimer = null;
let isShutdown = false;
let activeIOInstance = null;
let lifecycleGeneration = 0;
const pendingClients = new Set();

/**
 * Resolves the Redis connection URL with consistent precedence:
 * 1. customUrl (if provided and non-empty string)
 * 2. process.env.REDIS_URL (if non-empty string after trim)
 * 3. process.env.REDIS_URI (if non-empty string after trim)
 * 4. redis://${REDIS_HOST || '127.0.0.1'}:${REDIS_PORT || 6379}
 *
 * @param {string} [customUrl] - Optional URL override
 * @returns {string} Fully resolved Redis URL
 */
export function resolveRedisUrl(customUrl = null) {
  if (customUrl && typeof customUrl === "string" && customUrl.trim()) {
    return customUrl.trim();
  }
  const envUrl = (process.env.REDIS_URL && process.env.REDIS_URL.trim()) ||
                 (process.env.REDIS_URI && process.env.REDIS_URI.trim());
  if (envUrl) {
    return envUrl;
  }
  const host = (process.env.REDIS_HOST && process.env.REDIS_HOST.trim()) || "127.0.0.1";
  const port = (process.env.REDIS_PORT && process.env.REDIS_PORT.trim()) || "6379";
  return `redis://${host}:${port}`;
}

/**
 * Checks whether Redis scaling is enabled
 * @param {boolean} [customEnabled]
 * @returns {boolean}
 */
export function isRedisEnabled(customEnabled = null) {
  if (customEnabled !== undefined && customEnabled !== null) {
    return Boolean(customEnabled);
  }
  return process.env.REDIS_ENABLED !== "false";
}

/**
 * Default Redis configuration with dynamic getters
 */
export const REDIS_CONFIG = Object.freeze({
  get URL() {
    return resolveRedisUrl();
  },
  get ENABLED() {
    return isRedisEnabled();
  },
  CONNECT_TIMEOUT_MS: 3000,
  MAX_RECONNECT_RETRIES: 3
});

/**
 * Helper to safely tear down and disconnect a pending client
 */
async function cleanupPendingClient(client) {
  if (!client) return;
  pendingClients.delete(client);
  client.removeAllListeners();
  try {
    await client.quit().catch(() => {
      try { client.disconnect(); } catch (_) {}
    });
  } catch (_) {
    try { client.disconnect(); } catch (_) {}
  }
}

/**
 * Helper to safely tear down active publisher and subscriber clients
 */
async function teardownClients() {
  const promises = [];
  if (publisher) {
    const p = publisher;
    publisher = null;
    p.removeAllListeners();
    promises.push(
      p.quit().catch(() => {
        try { p.disconnect(); } catch (_) {}
      })
    );
  }
  if (subscriber) {
    const s = subscriber;
    subscriber = null;
    s.removeAllListeners();
    promises.push(
      s.quit().catch(() => {
        try { s.disconnect(); } catch (_) {}
      })
    );
  }
  isConnected = false;
  await Promise.allSettled(promises);
}

/**
 * Returns the number of temporary clients currently in-flight connecting
 * @returns {number}
 */
export function getPendingClientsCount() {
  return pendingClients.size;
}

/**
 * Initializes Redis publisher and subscriber clients.
 * Handles offline / connection failure gracefully without crashing the server process.
 *
 * @param {object} [customOptions] - Optional configuration overrides (e.g. for testing)
 * @returns {Promise<{ publisher: Redis|null, subscriber: Redis|null, isConnected: boolean }>}
 */
export async function initRedis(customOptions = {}) {
  // Capture current lifecycle generation
  const thisGeneration = ++lifecycleGeneration;
  isShutdown = false;
  isReconnecting = false;

  if (isInitialized && publisher && subscriber && isRedisConnected()) {
    return { publisher, subscriber, isConnected: true };
  }

  const enabled = isRedisEnabled(customOptions.enabled);
  const url = resolveRedisUrl(customOptions.url);

  if (!enabled) {
    console.log("[Redis] Redis scaling is disabled via REDIS_ENABLED=false");
    isInitialized = true;
    isConnected = false;
    return { publisher: null, subscriber: null, isConnected: false };
  }

  // If previous instances exist but are not connected, clean them up first
  if (publisher || subscriber) {
    await teardownClients();
  }

  // If any unassigned pending clients exist from an older generation, clean them up
  if (pendingClients.size > 0) {
    const stale = Array.from(pendingClients);
    pendingClients.clear();
    await Promise.allSettled(stale.map((c) => cleanupPendingClient(c)));
  }

  // If invalidated while awaiting previous teardown, abort
  if (thisGeneration !== lifecycleGeneration || isShutdown) {
    return { publisher: null, subscriber: null, isConnected: false };
  }

  const clientOptions = {
    lazyConnect: true,
    connectTimeout: customOptions.connectTimeout ?? REDIS_CONFIG.CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (isShutdown || times > REDIS_CONFIG.MAX_RECONNECT_RETRIES) {
        return null;
      }
      return Math.min(times * 500, 2000);
    },
    ...customOptions
  };

  let lastPublisherError = null;
  let lastSubscriberError = null;

  let tempPub = null;
  let tempSub = null;

  try {
    tempPub = new Redis(url, clientOptions);
    tempSub = new Redis(url, clientOptions);

    pendingClients.add(tempPub);
    pendingClients.add(tempSub);

    // Attach defensive error handlers to capture diagnostic error details
    tempPub.on("error", (err) => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      lastPublisherError = err;
      isConnected = isRedisConnected();
      const codeMsg = err.code ? `[${err.code}] ` : "";
      console.warn(`[Redis Publisher Error] ${codeMsg}${err.message}`);
      if (!isRedisConnected() && !isShutdown && activeIOInstance) {
        startRedisAutoReconnect(activeIOInstance);
      }
    });

    tempSub.on("error", (err) => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      lastSubscriberError = err;
      isConnected = isRedisConnected();
      const codeMsg = err.code ? `[${err.code}] ` : "";
      console.warn(`[Redis Subscriber Error] ${codeMsg}${err.message}`);
      if (!isRedisConnected() && !isShutdown && activeIOInstance) {
        startRedisAutoReconnect(activeIOInstance);
      }
    });

    tempPub.on("ready", () => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      isConnected = isRedisConnected();
      console.log("[Redis] Publisher connected and ready");
      if (isConnected) {
        stopRedisAutoReconnect();
        if (activeIOInstance) {
          import("../services/redisSync.js").then(({ setupRedisSync }) => {
            setupRedisSync(activeIOInstance).catch((syncErr) => {
              console.warn(`[Redis] Multi-instance sync failed on publisher ready: ${syncErr.message}`);
            });
          }).catch((importErr) => {
            console.warn(`[Redis] Failed to load redisSync on publisher ready: ${importErr.message}`);
          });
        }
      }
    });

    tempSub.on("ready", () => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      isConnected = isRedisConnected();
      console.log("[Redis] Subscriber connected and ready");
      if (isConnected) {
        stopRedisAutoReconnect();
        if (activeIOInstance) {
          import("../services/redisSync.js").then(({ setupRedisSync }) => {
            setupRedisSync(activeIOInstance).catch((syncErr) => {
              console.warn(`[Redis] Multi-instance sync failed on subscriber ready: ${syncErr.message}`);
            });
          }).catch((importErr) => {
            console.warn(`[Redis] Failed to load redisSync on subscriber ready: ${importErr.message}`);
          });
        }
      }
    });

    tempPub.on("close", () => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      isConnected = false;
      if (!isShutdown && activeIOInstance) {
        startRedisAutoReconnect(activeIOInstance);
      }
    });

    tempSub.on("close", () => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      isConnected = false;
      if (!isShutdown && activeIOInstance) {
        startRedisAutoReconnect(activeIOInstance);
      }
    });

    tempPub.on("end", () => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      isConnected = false;
      if (!isShutdown && activeIOInstance) {
        startRedisAutoReconnect(activeIOInstance);
      }
    });

    tempSub.on("end", () => {
      if (thisGeneration !== lifecycleGeneration || isShutdown) return;
      isConnected = false;
      if (!isShutdown && activeIOInstance) {
        startRedisAutoReconnect(activeIOInstance);
      }
    });

    // Attempt initial connection asynchronously with timeout
    await Promise.all([
      tempPub.connect(),
      tempSub.connect()
    ]);

    // Check if this initialization attempt was invalidated or shutdown occurred while connecting
    if (thisGeneration !== lifecycleGeneration || isShutdown) {
      await Promise.allSettled([
        cleanupPendingClient(tempPub),
        cleanupPendingClient(tempSub)
      ]);
      return { publisher: null, subscriber: null, isConnected: false };
    }

    pendingClients.delete(tempPub);
    pendingClients.delete(tempSub);

    publisher = tempPub;
    subscriber = tempSub;
    isConnected = isRedisConnected();
    isInitialized = true;
    console.log(`[Redis] Connected successfully to ${url}`);
    return { publisher, subscriber, isConnected: true };
  } catch (err) {
    await Promise.allSettled([
      cleanupPendingClient(tempPub),
      cleanupPendingClient(tempSub)
    ]);

    // If this attempt is outdated or shut down, do NOT overwrite newer or closed global state
    if (thisGeneration !== lifecycleGeneration || isShutdown) {
      return { publisher: null, subscriber: null, isConnected: false };
    }

    const underlying = lastPublisherError || lastSubscriberError;
    const detail = underlying
      ? `${underlying.code ? underlying.code + ": " : ""}${underlying.message}`
      : err.message;

    isConnected = false;
    isInitialized = true;
    publisher = null;
    subscriber = null;
    console.warn(`[Redis] Connection to ${url} unavailable (${detail}). Operating in standalone single-instance mode.`);

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
 * Checks whether Redis is currently connected and ready.
 * Reports true ONLY when both required Redis clients are actively in "ready" state.
 *
 * @returns {boolean}
 */
export function isRedisConnected() {
  return Boolean(
    !isShutdown &&
    publisher &&
    subscriber &&
    publisher.status === "ready" &&
    subscriber.status === "ready"
  );
}

/**
 * Starts periodic background reconnection attempts if Redis is offline.
 * Seamlessly connects and synchronizes once Redis becomes available.
 * Prevents duplicate timers and concurrent in-flight reconnect attempts.
 *
 * @param {import("socket.io").Server} [io] - Optional Socket.IO server for syncing on connect
 * @param {number} [intervalMs=2500] - Reconnection poll interval in milliseconds
 */
export function startRedisAutoReconnect(io, intervalMs = 2500) {
  if (io) {
    activeIOInstance = io;
  }

  if (isShutdown || autoReconnectTimer || isRedisConnected()) {
    return;
  }

  autoReconnectTimer = setInterval(async () => {
    // If shutting down or already connected, stop timer
    if (isShutdown || isRedisConnected()) {
      stopRedisAutoReconnect();
      return;
    }

    // Prevent concurrent reconnection runs
    if (isReconnecting) {
      return;
    }

    isReconnecting = true;
    try {
      const res = await initRedis();
      if (res && res.isConnected && !isShutdown) {
        console.log("[Redis] Background auto-reconnect succeeded! Re-establishing cross-instance sync.");
        stopRedisAutoReconnect();
        if (activeIOInstance) {
          const { setupRedisSync } = await import("../services/redisSync.js");
          await setupRedisSync(activeIOInstance);
        }
      }
    } catch (_) {
      // Standalone mode: silently continue background retry
    } finally {
      isReconnecting = false;
    }
  }, intervalMs);

  if (autoReconnectTimer && typeof autoReconnectTimer.unref === "function") {
    autoReconnectTimer.unref();
  }
}

/**
 * Stops any active background auto-reconnect timer
 */
export function stopRedisAutoReconnect() {
  if (autoReconnectTimer) {
    clearInterval(autoReconnectTimer);
    autoReconnectTimer = null;
  }
}

/**
 * Returns whether background auto-reconnection is currently active
 * @returns {boolean}
 */
export function isAutoReconnectActive() {
  return Boolean(autoReconnectTimer);
}

/**
 * Closes active Redis connections cleanly (useful for tests and graceful shutdown).
 * Cancels active reconnect timers, disconnects pending in-flight clients, and resets synchronization state.
 */
export async function closeRedis() {
  lifecycleGeneration++;
  isShutdown = true;
  stopRedisAutoReconnect();

  // Clean up any in-flight pending clients from uncompleted initializations
  const pendingToClose = Array.from(pendingClients);
  pendingClients.clear();
  const pendingPromises = pendingToClose.map((client) => cleanupPendingClient(client));

  await Promise.allSettled(pendingPromises);
  await teardownClients();

  publisher = null;
  subscriber = null;
  isConnected = false;
  isInitialized = false;

  try {
    const { resetRedisSyncState } = await import("../services/redisSync.js");
    resetRedisSyncState();
  } catch (_) {}
}

/**
 * Backward-compatible helper: Initializes Redis and attaches adapter or synchronization.
 * If Redis is not configured or fails to connect, gracefully falls back to in-memory mode.
 *
 * @param {import("socket.io").Server} [io] - Socket.io server instance
 * @returns {Promise<boolean>} Whether Redis was successfully attached
 */
export async function setupRedisAdapter(io) {
  if (io) {
    activeIOInstance = io;
  }

  const envUrl = (process.env.REDIS_URL && process.env.REDIS_URL.trim()) ||
                 (process.env.REDIS_URI && process.env.REDIS_URI.trim());

  if (!envUrl) {
    console.log("ℹ️ REDIS_URL not configured. Operating with default in-memory Socket.io adapter.");
    return false;
  }

  if (!isRedisEnabled()) {
    console.log("ℹ️ Redis scaling is disabled via REDIS_ENABLED=false. Operating with default in-memory Socket.io adapter.");
    return false;
  }

  try {
    const res = await initRedis({ url: envUrl });
    if (!res || !res.isConnected) {
      return false;
    }

    if (io) {
      const { setupRedisSync } = await import("../services/redisSync.js");
      await setupRedisSync(io);
    }

    console.log("✅ Socket.io Redis multi-instance sync successfully initialized and attached.");
    return true;
  } catch (err) {
    console.warn("⚠️ Failed to initialize Redis adapter. Falling back to default in-memory adapter:", err.message);
    return false;
  }
}

/**
 * Backward-compatible helper: Closes active Redis connections cleanly
 */
export async function closeRedisConnection() {
  await closeRedis();
}
