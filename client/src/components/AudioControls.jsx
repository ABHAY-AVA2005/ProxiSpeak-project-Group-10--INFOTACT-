import React from 'react';

export function AudioControls({ isMuted, toggleMute, permissionGranted, startAudio }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100 }}>
      {!permissionGranted ? (
        <button
          onClick={startAudio}
          style={{
            padding: '10px 18px',
            backgroundColor: '#2563eb',
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          🎙️ Enable Microphone
        </button>
      ) : (
        <button
          onClick={toggleMute}
          style={{
            padding: '10px 18px',
            backgroundColor: isMuted ? '#ef4444' : '#10b981',
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: '600',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {isMuted ? '🔇 Mic Muted' : '🎙️ Mic Active'}
        </button>
      )}
    </div>
  );
}