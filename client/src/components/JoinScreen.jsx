import React, { useState } from 'react';

export function JoinScreen({ onJoin }) {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const clean = username.trim();
    if (clean) {
      onJoin(clean);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#18181b',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        background: '#27272a',
        padding: '32px',
        borderRadius: '12px',
        width: '320px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
      }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px' }}>Join ProxiSpeak</h2>
        <p style={{ margin: '0 0 20px 0', color: '#a1a1aa', fontSize: '14px' }}>
          Enter a username to join the space
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your name"
            maxLength={30}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '6px',
              border: '1px solid #3f3f46',
              background: '#18181b',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
              marginBottom: '16px'
            }}
            required
          />
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Enter Office
          </button>
        </form>
      </div>
    </div>
  );
}
