export function AudioControls({
  isMuted,
  toggleMute,
  permissionGranted,
  startAudio,
  speakerEnabled,
  speakerVolume,
  setSpeakerVolume,
  toggleSpeakerMute,
}) {
  const speakerLabel = speakerEnabled ? `${speakerVolume}%` : 'Muted';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <button
        type="button"
        className="toolbar-icon"
        aria-label={speakerEnabled ? 'Mute audio output' : 'Enable audio output'}
        onClick={toggleSpeakerMute}
        title={speakerEnabled ? 'Mute system sound' : 'Enable system sound'}
      >
        {speakerEnabled ? '🔊' : '🔇'}
      </button>

      <button
        type="button"
        className="toolbar-icon volume-btn"
        aria-label="Decrease sound"
        onClick={() => setSpeakerVolume(Math.max(0, speakerVolume - 10))}
        title="Decrease system sound."
      >
        −
      </button>

      <button
        type="button"
        className="toolbar-icon volume-btn"
        aria-label="Increase sound"
        onClick={() => setSpeakerVolume(Math.min(100, speakerVolume + 10))}
        title="Increase system sound."
      >
        +
      </button>

      <span
        className="pill-button"
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '82px' }}
        title={`Sound output: ${speakerLabel}`}
      >
        {speakerLabel}
      </span>

      {permissionGranted ? (
        <button
          type="button"
          className="pill-button"
          onClick={toggleMute}
          title={isMuted ? 'Enable microphone input' : 'Disable microphone input'}
        >
          {isMuted ? 'Mic Off' : 'Mic On'}
        </button>
      ) : (
        <button
          type="button"
          className="primary-button"
          onClick={startAudio}
          title="Enable microphone input for office calls."
          style={{ padding: '0.7rem 1rem', minWidth: '140px' }}
        >
          Enable Mic
        </button>
      )}
    </div>
  );
}
