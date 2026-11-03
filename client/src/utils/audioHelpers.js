const EARSHOT_RADIUS = 100;
const OBSTACLE_MUFFLE_FACTOR = 0.35; // Drops volume to 35% if a wall is in between

// Helper: check if line segment (p1 -> p2) intersects line segment (p3 -> p4)
function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false;
  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

// Check if line between two avatars cuts through a rectangular obstacle/wall
export function lineIntersectsRect(p1, p2, rect) {
  const { x, y, width, height } = rect;
  const left = lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, x, y, x, y + height);
  const right = lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, x + width, y, x + width, y + height);
  const top = lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, x, y, x + width, y);
  const bottom = lineIntersectsLine(p1.x, p1.y, p2.x, p2.y, x, y + height, x + width, y + height);
  return left || right || top || bottom;
}

export function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function getVolumeGain(distance, maxRadius = EARSHOT_RADIUS, isObstructed = false) {
  if (distance >= maxRadius) return 0;
  if (distance <= 0) return isObstructed ? OBSTACLE_MUFFLE_FACTOR : 1;

  const norm = distance / maxRadius;
  let gain = 0.5 * (1 + Math.cos(Math.PI * norm));
  if (isObstructed) gain *= OBSTACLE_MUFFLE_FACTOR;

  return Math.max(0, Math.min(1, Math.round(gain * 1000) / 1000));
}

export function getStereoPan(myPos, peerPos, maxDist = EARSHOT_RADIUS) {
  const deltaX = peerPos.x - myPos.x;
  return Math.max(-1, Math.min(1, Math.round((deltaX / maxDist) * 100) / 100));
}