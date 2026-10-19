import { useEffect, useCallback } from 'react';
import { createPeerConnection, closePeerConnection, closeAllPeerConnections } from '../utils/peerConnection';

export function useWebRTC({ socket, localStream, myId }) {
  // Attach local microphone tracks to a peer connection
  const attachLocalStream = useCallback((pc) => {
    if (!localStream) return;
    localStream.getTracks().forEach((track) => {
      const senders = pc.getSenders();
      const alreadyAdded = senders.some((s) => s.track && s.track.id === track.id);
      if (!alreadyAdded) {
        pc.addTrack(track, localStream);
      }
    });
  }, [localStream]);

  // Create an SDP offer and send it via socket
  const createOffer = useCallback(async (targetSocketId) => {
    if (!socket || !targetSocketId) return;

    const pc = createPeerConnection(targetSocketId, {
      onIceCandidate: (targetId, candidate) => {
        socket.emit('webrtc:ice-candidate', { targetId, candidate });
      },
      onTrack: (targetId, stream) => {
        console.log(`[WebRTC] Received remote audio stream from: ${targetId}`);
      },
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
  }, [socket, attachLocalStream]);

  // Handle incoming signaling events
  useEffect(() => {
    if (!socket) return;

    const onIncomingIceCandidate = async ({ senderId, candidate }) => {
      const pc = createPeerConnection(senderId, {});
      if (candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err);
        }
      }
    };

    const onUserDisconnected = (userId) => {
      closePeerConnection(userId);
    };

    socket.on('webrtc:ice-candidate', onIncomingIceCandidate);
    socket.on('user:left', onUserDisconnected);

    return () => {
      socket.off('webrtc:ice-candidate', onIncomingIceCandidate);
      socket.off('user:left', onUserDisconnected);
      closeAllPeerConnections();
    };
  }, [socket]);

  return {
    createOffer,
    closePeerConnection,
  };
}