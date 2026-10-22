import { performance } from "node:perf_hooks";

/**
 * Performance target for proximity queries (under 20 ms)
 * Defined in docs/context/00_AI_RULES.md and docs/context/05_TECH_DECISIONS.md
 */
export const TARGET_QUERY_TIME_MS = 20;

// Maximum number of recent timing entries kept in memory
const MAX_HISTORY_ENTRIES = 200;

// Internal state for metrics and recent query logs
const recentQueries = [];
const stats = {
  totalQueries: 0,
  totalDurationMs: 0,
  minDurationMs: Infinity,
  maxDurationMs: 0,
  slowQueryCount: 0,
  bySource: {
    mongodb: { count: 0, totalDurationMs: 0, slowCount: 0 },
    "in-memory": { count: 0, totalDurationMs: 0, slowCount: 0 },
    clustering: { count: 0, totalDurationMs: 0, slowCount: 0 }
  }
};

/**
 * Sanitizes input strings or objects to prevent logging credentials, URIs, or tokens.
 * @param {any} val
 * @returns {any}
 */
export function sanitizeLogData(val) {
  if (typeof val === "string") {
    return val
      .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "mongodb://[REDACTED]")
      .replace(/(password|secret|token|apiKey)=([^\s&"']+)/gi, "$1=[REDACTED]");
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (/password|secret|token|uri|connectionstring/i.test(k)) {
        clean[k] = "[REDACTED]";
      } else {
        clean[k] = sanitizeLogData(v);
      }
    }
    return clean;
  }
  return val;
}

/**
 * Logs useful timing information without exposing secrets.
 * Updates internal stats and keeps a recent history buffer.
 *
 * @param {object} entry
 * @param {string} entry.source - "mongodb", "in-memory", or "clustering"
 * @param {number} entry.durationMs - Execution time in milliseconds
 * @param {number} [entry.resultCount=0] - Number of results returned
 * @param {Array<number>} [entry.origin] - [x, y] coordinates
 * @param {number} [entry.maxDistance] - Search radius in pixels
 * @param {boolean} [entry.success=true] - Whether query succeeded
 * @param {string} [entry.error] - Optional sanitized error message
 * @returns {object} Formatted timing record
 */
export function logQueryTiming(entry) {
  const source = entry.source || "in-memory";
  const durationMs = Number(Number(entry.durationMs || 0).toFixed(3));
  const resultCount = typeof entry.resultCount === "number" ? entry.resultCount : 0;
  const success = entry.success !== false;
  const targetMet = durationMs < TARGET_QUERY_TIME_MS;

  const record = {
    source,
    durationMs,
    resultCount,
    origin: entry.origin ? [entry.origin[0], entry.origin[1]] : undefined,
    maxDistance: entry.maxDistance,
    targetMet,
    targetMs: TARGET_QUERY_TIME_MS,
    success,
    error: entry.error ? sanitizeLogData(String(entry.error)) : undefined,
    timestamp: Date.now()
  };

  // Update aggregated statistics
  stats.totalQueries++;
  stats.totalDurationMs += durationMs;
  stats.minDurationMs = Math.min(stats.minDurationMs, durationMs);
  stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
  if (!targetMet) {
    stats.slowQueryCount++;
  }

  // Update per-source statistics
  if (!stats.bySource[source]) {
    stats.bySource[source] = { count: 0, totalDurationMs: 0, slowCount: 0 };
  }
  stats.bySource[source].count++;
  stats.bySource[source].totalDurationMs += durationMs;
  if (!targetMet) {
    stats.bySource[source].slowCount++;
  }

  // Add to ring buffer
  recentQueries.push(record);
  if (recentQueries.length > MAX_HISTORY_ENTRIES) {
    recentQueries.shift();
  }

  // Format log message (safe, no secrets)
  const statusTag = targetMet ? "[TARGET MET]" : "[PERF ALERT - SLOW]";
  const originStr = record.origin ? ` at [${record.origin[0]}, ${record.origin[1]}]` : "";
  const radiusStr = record.maxDistance ? ` (radius: ${record.maxDistance}px)` : "";
  const countStr = `${resultCount} user${resultCount === 1 ? "" : "s"}`;
  const logMessage = `[QueryTimer] ${statusTag} ${source} query completed in ${durationMs.toFixed(2)}ms${originStr}${radiusStr} -> found ${countStr}`;

  if (!targetMet) {
    console.warn(logMessage);
  } else {
    // Only log standard query in dev / debug or when enabled to avoid test noise
    if (process.env.DEBUG_QUERY_TIMING === "true" || process.env.NODE_ENV === "development") {
      console.log(logMessage);
    }
  }

  return record;
}

/**
 * Measures the execution time of a query function, logging useful metrics.
 *
 * @param {Function} queryFn - Async or sync function executing the query
 * @param {object} metadata - Query metadata (source, origin, maxDistance, etc.)
 * @returns {Promise<any>} The result of queryFn
 */
export async function measureQuery(queryFn, metadata = {}) {
  const start = performance.now();
  let result;
  let success = true;
  let error = null;

  try {
    result = await queryFn();
    return result;
  } catch (err) {
    success = false;
    error = err.message;
    throw err;
  } finally {
    const durationMs = performance.now() - start;
    const resultCount = Array.isArray(result) ? result.length : (result ? 1 : 0);
    logQueryTiming({
      ...metadata,
      durationMs,
      resultCount,
      success,
      error
    });
  }
}

/**
 * Returns the most recent query timing entry or null if none recorded.
 * @returns {object|null}
 */
export function getLastQueryTiming() {
  if (recentQueries.length === 0) return null;
  return recentQueries[recentQueries.length - 1];
}

/**
 * Returns recent query timing history.
 * @param {number} [limit=50]
 * @returns {Array<object>}
 */
export function getRecentQueries(limit = 50) {
  return recentQueries.slice(-Math.min(limit, recentQueries.length));
}

/**
 * Returns aggregated query timing statistics.
 * @returns {object}
 */
export function getQueryStats() {
  const total = stats.totalQueries;
  const avg = total > 0 ? Number((stats.totalDurationMs / total).toFixed(3)) : 0;
  const targetMetRate = total > 0
    ? Number((((total - stats.slowQueryCount) / total) * 100).toFixed(1))
    : 100;

  const bySourceSummary = {};
  for (const [src, data] of Object.entries(stats.bySource)) {
    bySourceSummary[src] = {
      count: data.count,
      totalDurationMs: Number(data.totalDurationMs.toFixed(3)),
      avgDurationMs: data.count > 0 ? Number((data.totalDurationMs / data.count).toFixed(3)) : 0,
      slowCount: data.slowCount
    };
  }

  return {
    totalQueries: total,
    avgDurationMs: avg,
    minDurationMs: total > 0 ? Number(stats.minDurationMs.toFixed(3)) : 0,
    maxDurationMs: total > 0 ? Number(stats.maxDurationMs.toFixed(3)) : 0,
    slowQueryCount: stats.slowQueryCount,
    targetMetRate,
    targetThresholdMs: TARGET_QUERY_TIME_MS,
    bySource: bySourceSummary
  };
}

/**
 * Resets all query timing history and statistics.
 * Useful for test suites and benchmark runs.
 */
export function resetQueryStats() {
  recentQueries.length = 0;
  stats.totalQueries = 0;
  stats.totalDurationMs = 0;
  stats.minDurationMs = Infinity;
  stats.maxDurationMs = 0;
  stats.slowQueryCount = 0;
  stats.bySource.mongodb = { count: 0, totalDurationMs: 0, slowCount: 0 };
  stats.bySource["in-memory"] = { count: 0, totalDurationMs: 0, slowCount: 0 };
  stats.bySource.clustering = { count: 0, totalDurationMs: 0, slowCount: 0 };
}
