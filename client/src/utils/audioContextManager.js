let audioCtx = null;
const peerPipelines = new Map();

export function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Creates audio pipeline with anti-click gain ramp
 */
export function createPeerAudioPipeline(peerId, mediaStream) {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(mediaStream);
  const gainNode = ctx.createGain();

  // Start at zero gain to eliminate initial connection pop/thump
  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
  // Smoothly ramp to baseline over 60ms
  gainNode.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 0.06);

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  peerPipelines.set(peerId, { source, gainNode });
  return gainNode;
}

/**
 * Smoothly updates gain without audio pops or clicks
 */
export function setPeerVolume(peerId, volume) {
  const entry = peerPipelines.get(peerId);
  if (!entry || !audioCtx) return;

  const targetVol = Math.max(0.0001, Math.min(1.0, volume));
  // 30ms time constant filters out movement jitter and crackle
  entry.gainNode.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.03);
}

export function removePeerAudioPipeline(peerId) {
  const entry = peerPipelines.get(peerId);
  if (entry) {
    try {
      // Fade out over 20ms before tearing down node to avoid click
      entry.gainNode.gain.setValueAtTime(entry.gainNode.gain.value, audioCtx.currentTime);
      entry.gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.02);
      setTimeout(() => {
        entry.source.disconnect();
        entry.gainNode.disconnect();
        peerPipelines.delete(peerId);
      }, 30);
    } catch (_) {
      entry.source.disconnect();
      entry.gainNode.disconnect();
      peerPipelines.delete(peerId);
    }
  }
}