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

export function createPeerAudioPipeline(peerId, mediaStream) {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(mediaStream);
  const gainNode = ctx.createGain();
  const pannerNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

  gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 0.05);

  source.connect(gainNode);
  if (pannerNode) {
    gainNode.connect(pannerNode);
    pannerNode.connect(ctx.destination);
  } else {
    gainNode.connect(ctx.destination);
  }

  peerPipelines.set(peerId, { source, gainNode, pannerNode });
  return { gainNode, pannerNode };
}

export function updatePeerSpatialAudio(peerId, volume, pan) {
  const entry = peerPipelines.get(peerId);
  if (!entry || !audioCtx) return;

  const targetVol = Math.max(0.0001, Math.min(1.0, volume));
  entry.gainNode.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.03);

  if (entry.pannerNode) {
    const targetPan = Math.max(-1.0, Math.min(1.0, pan));
    entry.pannerNode.pan.setTargetAtTime(targetPan, audioCtx.currentTime, 0.03);
  }
}

export function removePeerAudioPipeline(peerId) {
  const entry = peerPipelines.get(peerId);
  if (entry) {
    try {
      entry.source.disconnect();
      entry.gainNode.disconnect();
      if (entry.pannerNode) entry.pannerNode.disconnect();
      peerPipelines.delete(peerId);
    } catch (_) {}
  }
}