import React from "react";

export function AudioControls({ isMuted, toggleMute, permissionGranted, startAudio, error }) {
  const buttonLabel = permissionGranted ? (isMuted ? "Unmute microphone" : "Mute microphone") : "Enable microphone";

  const handleClick = () => {
    if (!permissionGranted) {
      startAudio?.();
      return;
    }
    toggleMute?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={permissionGranted ? (isMuted ? "compact-action muted-button" : "compact-action mic-button") : "compact-action enable-button"}
      aria-label={buttonLabel}
      title={error || buttonLabel}
    >
      <span>{permissionGranted ? (isMuted ? "🔇" : "🎙") : "🎙"}</span>
    </button>
  );
}
