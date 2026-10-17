import React from 'react';

export function AudioControls({ isMuted, toggleMute, permissionGranted, startAudio }) {
  if (!permissionGranted) {
    return (
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}>
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
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          🎙️ Enable Microphone
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}>
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
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        {isMuted ? '🔇 Mic Muted' : '🎙️ Mic Active'}
      </button>
    </div>
  );
}