const MAX_DISTANCE = 100;

// Calculate distance between two user positions
export function getDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculate audio volume gain (1 = 100%, 0 = mute)
export function getVolumeGain(distance, maxDist = MAX_DISTANCE) {
  if (distance >= maxDist) return 0;
  if (distance <= 0) return 1;
  // linear falloff
  return 1 - distance / maxDist;
}

// Stereo panning (-1 is left ear, 0 is center, 1 is right ear)
export function getStereoPan(myPos, peerPos, maxDist = MAX_DISTANCE) {
  const deltaX = peerPos.x - myPos.x;
  const pan = deltaX / maxDist;
  if (pan < -1) return -1;
  if (pan > 1) return 1;
  return pan;
}