import { useState, useEffect, useCallback } from 'react';

export function useMediaStream() {
    const [localStream, setLocalStream] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [error, setError] = useState(null);

    const startAudio = useCallback(async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        },
        video: false,
    });

      setLocalStream(stream);
      setPermissionGranted(true);
      setError(null);
      return stream;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      setError(err.name || 'Microphone access denied');
      setPermissionGranted(false);
      return null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, [localStream]);

  // Cleanup tracks on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  return {
    localStream,
    isMuted,
    permissionGranted,
    error,
    startAudio,
    toggleMute,
  };
}