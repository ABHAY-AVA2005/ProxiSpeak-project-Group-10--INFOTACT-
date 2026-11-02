const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const peerConnections = new Map();

/**
 * Creates or gets an existing RTCPeerConnection for a remote peer socket ID
 */
export function createPeerConnection(peerSocketId, { onIceCandidate, onTrack, onConnectionStateChange } = {}) {
  if (peerConnections.has(peerSocketId)) {
    const existing = peerConnections.get(peerSocketId);
    if (existing.signalingState !== 'closed' && existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
      return existing;
    }
    closePeerConnection(peerSocketId);
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidate) {
      onIceCandidate(peerSocketId, event.candidate);
    }
  };

  pc.ontrack = (event) => {
    const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
    if (onTrack) {
      onTrack(peerSocketId, stream, event.track);
    }
  };

  pc.onconnectionstatechange = () => {
    if (onConnectionStateChange) {
      onConnectionStateChange(peerSocketId, pc.connectionState);
    }
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      closePeerConnection(peerSocketId);
    }
  };

  peerConnections.set(peerSocketId, pc);
  return pc;
}

/**
 * Closes and cleans up a peer connection
 */
export function closePeerConnection(peerSocketId) {
  const pc = peerConnections.get(peerSocketId);
  if (pc) {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    try {
      pc.close();
    } catch (err) {
      console.debug(`[WebRTC] Peer connection close note for ${peerSocketId}:`, err);
    }
    peerConnections.delete(peerSocketId);
  }
}

/**
 * Closes all peer connections on disconnect/leave
 */
export function closeAllPeerConnections() {
  for (const peerSocketId of peerConnections.keys()) {
    closePeerConnection(peerSocketId);
  }
}
