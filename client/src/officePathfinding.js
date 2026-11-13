class MinHeap {
  constructor(compare) {
    this.items = [];
    this.compare = compare;
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(items[parent], item) <= 0) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const first = items[0];
    const last = items.pop();
    if (items.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        const child = right < items.length && this.compare(items[right], items[left]) < 0
          ? right
          : left;
        if (this.compare(items[child], last) >= 0) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return first;
  }
}

function octileDistance(dx, dy) {
  const diagonal = Math.min(dx, dy);
  return dx + dy + (Math.SQRT2 - 2) * diagonal;
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function createGrid(width, height, gridSize) {
  const columns = Math.ceil(width / gridSize);
  const rows = Math.ceil(height / gridSize);
  const keyOf = (x, y) => `${x},${y}`;
  const centerOf = (x, y) => ({
    x: Math.min(width - 1e-6, x * gridSize + gridSize / 2),
    y: Math.min(height - 1e-6, y * gridSize + gridSize / 2),
  });
  return { columns, rows, keyOf, centerOf };
}

function isSegmentClear(start, end, isBlocked, sampleSpacing) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const sampleCount = Math.max(1, Math.ceil(distance / sampleSpacing));
  for (let sample = 0; sample <= sampleCount; sample++) {
    const progress = sample / sampleCount;
    const x = start.x + (end.x - start.x) * progress;
    const y = start.y + (end.y - start.y) * progress;
    if (isBlocked(x, y)) return false;
  }
  return true;
}

function findConnector(point, grid, isBlocked, sampleSpacing) {
  const candidates = [];
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.columns; x++) {
      const center = grid.centerOf(x, y);
      candidates.push({
        x,
        y,
        center,
        distance: Math.hypot(center.x - point.x, center.y - point.y),
      });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates.find(({ center }) =>
    isSegmentClear(point, center, isBlocked, sampleSpacing)
  ) || null;
}

function buildPath(start, goal, startKey, goalKey, cameFrom, grid) {
  const cells = [];
  let key = goalKey;
  while (true) {
    const [x, y] = key.split(",").map(Number);
    cells.push(grid.centerOf(x, y));
    if (key === startKey) break;
    key = cameFrom.get(key);
    if (!key) return [];
  }
  cells.reverse();

  const path = [start];
  for (const point of cells) {
    if (!samePoint(path[path.length - 1], point)) path.push(point);
  }
  if (!samePoint(path[path.length - 1], goal)) path.push(goal);
  return path;
}

export function findPath(start, goal, {
  width,
  height,
  gridSize,
  sampleSpacing,
  isBlocked,
} = {}) {
  if (
    !start || !goal || typeof isBlocked !== "function"
    || !Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(gridSize)
    || width <= 0 || height <= 0 || gridSize <= 0
    || !Number.isFinite(start.x) || !Number.isFinite(start.y)
    || !Number.isFinite(goal.x) || !Number.isFinite(goal.y)
  ) return [];
  if (
    start.x < 0 || start.y < 0 || start.x > width || start.y > height
    || goal.x < 0 || goal.y < 0 || goal.x > width || goal.y > height
  ) return [];
  const spacing = sampleSpacing > 0 ? sampleSpacing : gridSize / 4;
  if (isBlocked(start.x, start.y) || isBlocked(goal.x, goal.y)) return [];
  if (isSegmentClear(start, goal, isBlocked, spacing)) return [start, goal];

  const grid = createGrid(width, height, gridSize);
  const startConnector = findConnector(start, grid, isBlocked, spacing);
  const goalConnector = findConnector(goal, grid, isBlocked, spacing);
  if (!startConnector || !goalConnector) return [];

  const startKey = grid.keyOf(startConnector.x, startConnector.y);
  const goalKey = grid.keyOf(goalConnector.x, goalConnector.y);
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const closedSet = new Set();
  const blockedCellCache = new Map();
  const isCellBlocked = (x, y) => {
    if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) return true;
    const key = grid.keyOf(x, y);
    if (!blockedCellCache.has(key)) {
      const center = grid.centerOf(x, y);
      blockedCellCache.set(key, isBlocked(center.x, center.y));
    }
    return blockedCellCache.get(key);
  };
  const heuristic = (x, y) => octileDistance(Math.abs(x - goalConnector.x), Math.abs(y - goalConnector.y));
  const openSet = new MinHeap((a, b) =>
    a.f - b.f || a.h - b.h || a.y - b.y || a.x - b.x
  );
  openSet.push({
    x: startConnector.x,
    y: startConnector.y,
    key: startKey,
    g: 0,
    h: heuristic(startConnector.x, startConnector.y),
    f: heuristic(startConnector.x, startConnector.y),
  });

  const neighbors = [
    [0, -1, 1], [1, 0, 1], [0, 1, 1], [-1, 0, 1],
    [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2], [1, 1, Math.SQRT2],
  ];

  while (openSet.size > 0) {
    const current = openSet.pop();
    if (current.g !== gScore.get(current.key) || closedSet.has(current.key)) continue;
    if (current.key === goalKey) {
      return buildPath(start, goal, startKey, goalKey, cameFrom, grid);
    }
    closedSet.add(current.key);

    const currentPoint = grid.centerOf(current.x, current.y);
    for (const [dx, dy, moveCost] of neighbors) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= grid.columns || y >= grid.rows) continue;

      const key = grid.keyOf(x, y);
      if (closedSet.has(key)) continue;
      if (isCellBlocked(x, y)) continue;

      const nextPoint = grid.centerOf(x, y);
      if (!isSegmentClear(currentPoint, nextPoint, isBlocked, spacing)) continue;
      const tentativeG = current.g + moveCost;
      if (tentativeG >= (gScore.get(key) ?? Infinity)) continue;

      const h = heuristic(x, y);
      cameFrom.set(key, current.key);
      gScore.set(key, tentativeG);
      openSet.push({ x, y, key, g: tentativeG, h, f: tentativeG + h });
    }
  }

  return [];
}
