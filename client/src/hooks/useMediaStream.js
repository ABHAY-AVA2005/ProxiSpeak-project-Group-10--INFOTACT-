import { useState, useEffect, useCallback } from 'react';

export function useMediaStream() {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState(null);
  const [volumeLevel, setVolumeLevel] = useState(100);

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
      setVolumeLevel(100);
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

  const updateVolume = useCallback((nextValue) => {
    const clamped = Math.min(100, Math.max(0, Number(nextValue) || 0));
    setVolumeLevel(clamped);

    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    if (clamped <= 0 || isMuted) {
      audioTrack.enabled = false;
      setIsMuted(true);
      return;
    }

    audioTrack.enabled = true;
    setIsMuted(false);
  }, [isMuted, localStream]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = !audioTrack.enabled;
      audioTrack.enabled = nextMuted;
      setIsMuted(!nextMuted);
      if (nextMuted) {
        setVolumeLevel(0);
      } else if (volumeLevel === 0) {
        setVolumeLevel(50);
      }
    }
  }, [localStream, volumeLevel]);

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
    volumeLevel,
    setVolumeLevel: updateVolume,
  };
}