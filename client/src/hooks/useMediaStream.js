import { useState, useEffect, useCallback, useRef } from 'react';

export function useMediaStream() {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const streamRef = useRef(null);

  const startAudio = useCallback(async () => {
    if (streamRef.current) return streamRef.current;

    // Check secure context (HTTPS or localhost) required by browser mediaDevices API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("Microphone access requires HTTPS or localhost.");
      console.error("[Audio] Insecure context: getUserMedia not supported.");
      return null;
    }

    try {
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
      setErrorMessage(null);
      return stream;
    } catch (err) {
      console.error("[Audio] Microphone permission rejected or hardware unavailable:", err);
      if (err.name === 'NotAllowedError') {
        setErrorMessage("Microphone permission denied. Please allow mic in browser settings.");
      } else if (err.name === 'NotFoundError') {
        setErrorMessage("No microphone device found on this system.");
      } else {
        setErrorMessage("Could not initialize microphone.");
      }
      return null;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { localStream, isMuted, permissionGranted, errorMessage, startAudio, toggleMute };
}