import { useState, useEffect, useCallback, useRef } from 'react';

export function useMediaStream() {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  useEffect(() => {
    streamRef.current = localStream;
  }, [localStream]);

  const startAudio = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("navigator.mediaDevices.getUserMedia is not supported");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = true;
        console.log(`[MediaStream] Acquired audio track: id=${audioTracks[0].id}, enabled=${audioTracks[0].enabled}, state=${audioTracks[0].readyState}`);
      }

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

  // Cleanup tracks only when component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          console.log(`[MediaStream] Stopping local track ${track.id} on unmount`);
          track.stop();
        });
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
  };
}
