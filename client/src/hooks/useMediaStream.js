import { useState, useEffect, useCallback, useRef } from 'react';

export function useMediaStream() {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState(null);
  const [volumeLevel, setVolumeLevelState] = useState(100);
  const streamRef = useRef(null);

  const startAudio = useCallback(async () => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      const message = 'This browser does not support microphone access.';
      setError(message);
      setPermissionGranted(false);
      return null;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      streamRef.current = stream;
      setLocalStream(stream);
      setPermissionGranted(true);
      setIsMuted(false);
      setVolumeLevelState(100);
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
  }, []);

  const updateVolume = useCallback((nextValue) => {
    setVolumeLevelState((current) => {
      const value = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      const clamped = Math.min(100, Math.max(0, Number(value) || 0));

      if (streamRef.current) {
        const audioTrack = streamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          const shouldBeEnabled = clamped > 0 && !isMuted;
          audioTrack.enabled = shouldBeEnabled;
        }
      }

      setIsMuted(clamped <= 0);
      return clamped;
    });
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;

    const nextMuted = !audioTrack.enabled;
    audioTrack.enabled = !nextMuted;
    setIsMuted(nextMuted);

    if (nextMuted) {
      setVolumeLevelState(0);
    } else if (volumeLevel === 0) {
      setVolumeLevelState(50);
    }
  }, [volumeLevel]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

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