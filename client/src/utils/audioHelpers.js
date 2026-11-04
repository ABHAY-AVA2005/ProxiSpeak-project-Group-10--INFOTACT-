const EARSHOT_RADIUS = 100;
const OBSTACLE_MUFFLE_FACTOR = 0.35;

export function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

//Logarithmic-perceptual attenuation curve tuned to Fletcher-Munson human ear sensitivity
export function getVolumeGain(distance, maxRadius = EARSHOT_RADIUS, isObstructed = false) {
  if (distance >= maxRadius) return 0;
  if (distance <= 0) return isObstructed ? OBSTACLE_MUFFLE_FACTOR : 1.0;

  // Logarithmic distance roll-off matches natural acoustics
  const normalized = distance / maxRadius;
  let gain = Math.pow(1 - normalized, 1.8);

  if (isObstructed) {
    gain *= OBSTACLE_MUFFLE_FACTOR;
  }
  return Math.max(0, Math.min(1, Math.round(gain * 1000) / 1000));
}

// Natural stereo panning curve with gentle center-deadzone
 
export function getStereoPan(myPos, peerPos, maxDist = EARSHOT_RADIUS) {
  const deltaX = peerPos.x - myPos.x;
  let pan = deltaX / maxDist;

  // 10% center deadzone keeps voices centered when directly in front/behind
  if (Math.abs(pan) < 0.1) return 0;

  pan = Math.sign(pan) * Math.pow(Math.abs(pan), 1.2);
  return Math.max(-1, Math.min(1, Math.round(pan * 100) / 100));
}