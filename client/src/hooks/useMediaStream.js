import { useState, useEffect, useCallback, useRef } from 'react';

export function useMediaStream() {
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [error, setError] = useState(null);
  const [speakerVolume, setSpeakerVolume] = useState(80);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const outputGainRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    streamRef.current = localStream;

    if (!localStream) {
      sourceRef.current = null;
      return;
    }

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
        outputGainRef.current = audioContextRef.current.createGain();
        outputGainRef.current.gain.value = speakerEnabled ? speakerVolume / 100 : 0;
        outputGainRef.current.connect(audioContextRef.current.destination);
      }
    }

    if (audioContextRef.current && outputGainRef.current && !sourceRef.current) {
      const sourceNode = audioContextRef.current.createMediaStreamSource(localStream);
      sourceNode.connect(outputGainRef.current);
      sourceRef.current = sourceNode;
    }
  }, [localStream, speakerEnabled, speakerVolume]);

  useEffect(() => {
    if (outputGainRef.current) {
      outputGainRef.current.gain.value = speakerEnabled ? speakerVolume / 100 : 0;
    }
  }, [speakerEnabled, speakerVolume]);

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

  const toggleSpeakerMute = useCallback(() => {
    setSpeakerEnabled((current) => !current);
  }, []);

  const updateSpeakerVolume = useCallback((nextVolume) => {
    const clampedValue = Math.max(0, Math.min(100, Number(nextVolume) || 0));
    setSpeakerVolume(clampedValue);
  }, []);

  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
        outputGainRef.current = null;
      }

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
    speakerEnabled,
    speakerVolume,
    setSpeakerVolume: updateSpeakerVolume,
    toggleSpeakerMute,
  };
}
