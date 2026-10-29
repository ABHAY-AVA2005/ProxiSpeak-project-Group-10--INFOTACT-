import test from "node:test";
import assert from "node:assert/strict";

import {
  TARGET_QUERY_TIME_MS,
  sanitizeLogData,
  logQueryTiming,
  getQueryStats,
  getRecentQueries,
  resetQueryStats
} from "../src/services/queryTimer.js";

test("query timer starts with empty statistics", () => {
  resetQueryStats();

  const stats = getQueryStats();

  assert.equal(stats.totalQueries, 0);
  assert.equal(stats.avgDurationMs, 0);
  assert.equal(stats.slowQueryCount, 0);
});

test("query timer records successful queries", () => {
  resetQueryStats();

  logQueryTiming({
    source: "in-memory",
    durationMs: 5,
    resultCount: 3
  });

  const stats = getQueryStats();

  assert.equal(stats.totalQueries, 1);
  assert.equal(stats.avgDurationMs, 5);
  assert.equal(stats.slowQueryCount, 0);
  assert.equal(stats.targetMetRate, 100);
});

test("query timer detects slow queries", () => {
  resetQueryStats();

  logQueryTiming({
    source: "mongodb",
    durationMs: TARGET_QUERY_TIME_MS + 5,
    resultCount: 2
  });

  const stats = getQueryStats();

  assert.equal(stats.totalQueries, 1);
  assert.equal(stats.slowQueryCount, 1);
  assert.equal(stats.targetMetRate, 0);
});

test("query timer retains recent query history", () => {
  resetQueryStats();

  logQueryTiming({
    source: "clustering",
    durationMs: 3,
    resultCount: 4
  });

  const history = getRecentQueries();

  assert.equal(history.length, 1);
  assert.equal(history[0].source, "clustering");
  assert.equal(history[0].resultCount, 4);
});

test("query timer redacts sensitive information", () => {
  const input = {
    username: "testuser",
    password: "secret123",
    token: "abc123",
    message: "mongodb://admin:password@localhost:27017/test"
  };

  const result = sanitizeLogData(input);

  assert.equal(result.username, "testuser");
  assert.equal(result.password, "[REDACTED]");
  assert.equal(result.token, "[REDACTED]");
  assert.ok(!result.message.includes("admin:password"));
});

test("query timer reset clears previous measurements", () => {
  resetQueryStats();

  logQueryTiming({
    source: "in-memory",
    durationMs: 10
  });

  resetQueryStats();

  assert.equal(getQueryStats().totalQueries, 0);
  assert.equal(getRecentQueries().length, 0);
});
