import React from 'react';

export function AudioControls({ isMuted, toggleMute, permissionGranted, startAudio, error }) {
  const buttonStyle = {
    padding: '10px 18px',
    color: '#fff',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.8)',
    cursor: 'pointer',
    fontWeight: 700,
    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.25)',
    transition: 'transform 0.15s ease',
  };

  if (!permissionGranted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px', position: 'static' }}>
        <button
          onClick={startAudio}
          style={{ ...buttonStyle, background: 'linear-gradient(135deg, #2563eb, #3b82f6)' }}
        >
          🎙️ Enable Microphone
        </button>
        {error && (
          <div style={{ maxWidth: 260, background: 'rgba(15, 23, 42, 0.8)', color: '#fca5a5', borderRadius: 8, padding: '8px 10px', fontSize: '12px' }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: 'static', display: 'inline-flex' }}>
      <button
        onClick={toggleMute}
        style={{
          ...buttonStyle,
          background: isMuted ? 'linear-gradient(135deg, #ef4444, #f87171)' : 'linear-gradient(135deg, #10b981, #34d399)',
        }}
      >
        {isMuted ? '🔇 Mic Muted' : '🎙️ Mic Active'}
      </button>
    </div>
  );
}