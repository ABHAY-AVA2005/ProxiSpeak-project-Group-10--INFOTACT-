import { useState, useEffect, useCallback } from 'react';

export function useMediaStream() {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState(null);

  const startAudio = useCallback(async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      const message = 'This browser does not support microphone access.';
      setError(message);
      setPermissionGranted(false);
      return null;
    }

    try {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

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
      setIsMuted(false);
      setError(null);
      return stream;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      const message = err && err.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Please allow access and try again.'
        : 'Unable to enable microphone. Please check browser permissions and try again.';
      setError(message);
      setPermissionGranted(false);
      return null;
    }
  }, [localStream]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  }, [localStream]);

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