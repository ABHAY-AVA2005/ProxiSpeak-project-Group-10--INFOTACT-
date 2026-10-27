let audioCtx = null;
const peerGainNodes = new Map();

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

  // default volume
  gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  peerGainNodes.set(peerId, { source, gainNode });
  return gainNode;
}