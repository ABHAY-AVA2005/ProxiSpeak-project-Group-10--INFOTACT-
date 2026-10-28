export function setPeerVolume(peerId, volume) {
  const entry = peerGainNodes.get(peerId);
  if (!entry || !audioCtx) return;

  const clamped = Math.max(0, Math.min(1, volume));
  // Smoothly ramp gain over 50ms to prevent clicking/popping
  entry.gainNode.gain.setTargetAtTime(clamped, audioCtx.currentTime, 0.05);
}

export function removePeerAudioPipeline(peerId) {
  const entry = peerGainNodes.get(peerId);
  if (entry) {
    entry.source.disconnect();
    entry.gainNode.disconnect();
    peerGainNodes.delete(peerId);
  }
}