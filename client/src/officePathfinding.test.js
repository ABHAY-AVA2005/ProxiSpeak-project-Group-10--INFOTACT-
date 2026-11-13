import assert from "node:assert/strict";
import test from "node:test";
import { findPath } from "./officePathfinding.js";

const config = {
  width: 100,
  height: 100,
  gridSize: 10,
  sampleSpacing: 2,
};

function assertPathClear(path, isBlocked) {
  assert.ok(path.length > 0, "expected a route");
  for (let segment = 1; segment < path.length; segment++) {
    const start = path[segment - 1];
    const end = path[segment];
    const samples = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 2);
    for (let sample = 0; sample <= samples; sample++) {
      const progress = samples ? sample / samples : 0;
      assert.equal(
        isBlocked(
          start.x + (end.x - start.x) * progress,
          start.y + (end.y - start.y) * progress
        ),
        false,
        "route crossed a blocked point"
      );
    }
  }
}

test("uses a direct route only when its full segment is clear", () => {
  const start = { x: 10, y: 10 };
  const goal = { x: 90, y: 90 };
  const path = findPath(start, goal, { ...config, isBlocked: () => false });

  assert.deepEqual(path, [start, goal]);
});

test("routes around obstacles without clipping their corners", () => {
  const isBlocked = (x, y) => x >= 45 && x <= 55 && y <= 70;
  const start = { x: 20, y: 50 };
  const goal = { x: 80, y: 50 };
  const path = findPath(start, goal, { ...config, isBlocked });

  assertPathClear(path, isBlocked);
  assert.deepEqual(path[0], start);
  assert.deepEqual(path[path.length - 1], goal);
  assert.ok(path.some((point) => point.y > 70));
});

test("returns no route when an obstacle fully separates the endpoints", () => {
  const isBlocked = (x) => x >= 45 && x <= 55;
  const path = findPath(
    { x: 20, y: 50 },
    { x: 80, y: 50 },
    { ...config, isBlocked }
  );

  assert.deepEqual(path, []);
});

test("does not squeeze diagonally between blocked adjacent cells", () => {
  const isBlocked = (x, y) => (x >= 10 && y <= 10) || (x <= 10 && y >= 10);
  const path = findPath(
    { x: 5, y: 5 },
    { x: 15, y: 15 },
    { ...config, width: 20, height: 20, isBlocked }
  );

  assert.deepEqual(path, []);
});

test("rejects blocked endpoints", () => {
  const isBlocked = (x, y) => x > 40 && x < 60 && y > 40 && y < 60;
  assert.deepEqual(
    findPath({ x: 50, y: 50 }, { x: 80, y: 80 }, { ...config, isBlocked }),
    []
  );
});
