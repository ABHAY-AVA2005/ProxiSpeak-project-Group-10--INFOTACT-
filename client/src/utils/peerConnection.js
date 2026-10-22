const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const peerConnections = new Map();
const audioElements = new Map();

export function createPeerConnection(peerSocketId, { onIceCandidate, onTrack, onConnectionStateChange }) {
  if (peerConnections.has(peerSocketId)) {
    return peerConnections.get(peerSocketId);
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(peerSocketId, event.candidate);
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    if (!audioElements.has(peerSocketId)) {
      const audio = new Audio();
      audio.srcObject = stream;
      audio.autoplay = true;
      audioElements.set(peerSocketId, audio);
    }
    if (onTrack) onTrack(peerSocketId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStateChange) onConnectionStateChange(peerSocketId, pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      closePeerConnection(peerSocketId);
    }
  };

  peerConnections.set(peerSocketId, pc);
  return pc;
}

export function closePeerConnection(peerSocketId) {
  const pc = peerConnections.get(peerSocketId);
  if (pc) {
    pc.close();
    peerConnections.delete(peerSocketId);
  }
  const audio = audioElements.get(peerSocketId);
  if (audio) {
    audio.pause();
    audio.srcObject = null;
    audioElements.delete(peerSocketId);
  }
}

export function closeAllPeerConnections() {
  for (const peerSocketId of peerConnections.keys()) {
    closePeerConnection(peerSocketId);
  }
}