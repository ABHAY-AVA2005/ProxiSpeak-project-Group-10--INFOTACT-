import { useEffect, useCallback, useRef } from 'react';
import { createPeerConnection, closePeerConnection, closeAllPeerConnections } from '../utils/peerConnection';

export function useWebRTC({ socket, localStream }) {
  const pendingCandidatesRef = useRef(new Map());

  // Attach local microphone tracks to a peer connection
  const attachLocalStream = useCallback((pc) => {
    if (!localStream) {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      return;
    }
    localStream.getTracks().forEach((track) => {
      const senders = pc.getSenders();
      const alreadyAdded = senders.some((s) => s.track && s.track.id === track.id);
      if (!alreadyAdded) {
        pc.addTrack(track, localStream);
      }
    });
  }, [localStream]);

  const handleRemoteTrack = useCallback((targetId, stream) => {
    console.log(`[WebRTC] Received remote audio stream from: ${targetId}`);
    let audioEl = document.getElementById(`audio-${targetId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `audio-${targetId}`;
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    }
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    audioEl.muted = false;
    audioEl.volume = 1.0;
    if (audioEl.srcObject !== stream) {
      audioEl.srcObject = stream;
    }
    audioEl.play().catch((err) => {
      console.warn(`[WebRTC] Audio autoplay note for ${targetId}:`, err);
    });
  }, []);

  const drainCandidates = useCallback(async (peerId, pc) => {
    const queue = pendingCandidatesRef.current.get(peerId);
    if (queue && queue.length > 0) {
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.error(`[WebRTC] Error adding queued ICE candidate for ${peerId}:`, err);
        }
      }
      pendingCandidatesRef.current.delete(peerId);
    }
  }, []);

  // Create an SDP offer and send it via socket
  const createOffer = useCallback(async (targetSocketId) => {
    if (!socket || !targetSocketId) return;

    const pc = createPeerConnection(targetSocketId, {
      onIceCandidate: (targetId, candidate) => {
        socket.emit('webrtc:ice-candidate', { targetId, candidate });
      },
      onTrack: handleRemoteTrack,
    });

    attachLocalStream(pc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('webrtc:offer', {
        targetId: targetSocketId,
        offer,
      });
    } catch (err) {
      console.error(`[WebRTC] Failed to create offer for ${targetSocketId}:`, err);
    }
  }, [socket, attachLocalStream, handleRemoteTrack]);

  // Handle incoming signaling events
  useEffect(() => {
    if (!socket) return;

    const onIncomingOffer = async ({ senderId, offer }) => {
      const pc = createPeerConnection(senderId, {
        onIceCandidate: (targetId, candidate) => {
          socket.emit('webrtc:ice-candidate', { targetId, candidate });
        },
        onTrack: handleRemoteTrack,
      });
      attachLocalStream(pc);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await drainCandidates(senderId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', { targetId: senderId, answer });
      } catch (err) {
        console.error('[WebRTC] Error handling offer:', err);
      }
    };

    const onIncomingAnswer = async ({ senderId, answer }) => {
      const pc = createPeerConnection(senderId, { onTrack: handleRemoteTrack });
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await drainCandidates(senderId, pc);
      } catch (err) {
        console.error('[WebRTC] Error handling answer:', err);
      }
    };

    const onIncomingIceCandidate = async ({ senderId, candidate }) => {
      if (!candidate) return;
      const pc = createPeerConnection(senderId, { onTrack: handleRemoteTrack });
      if (!pc || !pc.remoteDescription) {
        let queue = pendingCandidatesRef.current.get(senderId);
        if (!queue) {
          queue = [];
          pendingCandidatesRef.current.set(senderId, queue);
        }
        queue.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate:', err);
      }
    };

    const onUserDisconnected = (data) => {
      const userId = typeof data === 'object' && data !== null ? (data.socketId || data.id) : data;
      if (!userId) return;
      closePeerConnection(userId);
      pendingCandidatesRef.current.delete(userId);
      const audioEl = document.getElementById(`audio-${userId}`);
      if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
      }
    };

    socket.on('webrtc:offer', onIncomingOffer);
    socket.on('webrtc:answer', onIncomingAnswer);
    socket.on('webrtc:ice-candidate', onIncomingIceCandidate);
    socket.on('user:left', onUserDisconnected);

    return () => {
      socket.off('webrtc:offer', onIncomingOffer);
      socket.off('webrtc:answer', onIncomingAnswer);
      socket.off('webrtc:ice-candidate', onIncomingIceCandidate);
      socket.off('user:left', onUserDisconnected);
      closeAllPeerConnections();
      document.querySelectorAll('audio[id^="audio-"]').forEach((el) => {
        el.pause();
        el.srcObject = null;
        el.remove();
      });
    };
  }, [socket, attachLocalStream, handleRemoteTrack, drainCandidates]);

  return {
    createOffer,
    closePeerConnection,
  };
}
