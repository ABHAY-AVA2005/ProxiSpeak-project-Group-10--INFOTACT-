const EARSHOT_RADIUS = 100; // 100px earshot distance

export function getDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates volume falloff by distance with smooth boundary crossfade:
 * - At distance 0 -> volume 1.0 (100%)
 * - Approaching 100px -> smooth S-curve crossfade to 0.0 (prevents hard cutoff)
 */
export function getVolumeGain(distance, maxRadius = EARSHOT_RADIUS) {
  if (distance >= maxRadius) return 0;
  if (distance <= 0) return 1;

  // Normalized distance 0 to 1
  const norm = distance / maxRadius;

  // Smooth cosine crossfade: 1 at 0 distance, smoothly approaches 0 at boundary
  const gain = 0.5 * (1 + Math.cos(Math.PI * norm));
  return Math.max(0, Math.min(1, Math.round(gain * 1000) / 1000));
}

export function getStereoPan(myPos, peerPos, maxDist = EARSHOT_RADIUS) {
  const deltaX = peerPos.x - myPos.x;
  const pan = deltaX / maxDist;
  return Math.max(-1, Math.min(1, Math.round(pan * 100) / 100));
}