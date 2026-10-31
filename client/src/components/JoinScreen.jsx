import React, { useState } from 'react';

export function JoinScreen({ onJoin }) {
  const [username, setUsername] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const clean = username.trim();
    if (!clean) {
      setIsError(true);
      return;
    }
    setIsError(false);
    onJoin(clean);
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'radial-gradient(circle at top, #1f2937 0%, #0f172a 55%, #020817 100%)',
      color: '#fff',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div style={{
        background: 'rgba(39, 39, 42, 0.9)',
        padding: '32px',
        borderRadius: '16px',
        width: '360px',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.45)',
        border: '1px solid rgba(148, 163, 184, 0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '18px' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🗣️</div>
          <h2 style={{ margin: 0, fontSize: '24px' }}>Join ProxiSpeak</h2>
        </div>
        <p style={{ margin: '0 0 18px 0', color: '#cbd5e1', fontSize: '14px', textAlign: 'center' }}>
          Enter a username to join the office and start voice chat when nearby.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (isError && e.target.value.trim()) setIsError(false);
            }}
            placeholder="Your name"
            maxLength={30}
            aria-invalid={isError}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: '10px',
              border: isError ? '1px solid #f87171' : '1px solid #475569',
              background: '#0f172a',
              color: '#fff',
              fontSize: '14px',
              boxSizing: 'border-box',
              marginBottom: '12px',
              outline: 'none'
            }}
            required
          />
          {isError && (
            <div style={{ color: '#fca5a5', fontSize: '12px', marginBottom: '12px' }}>
              Please enter a valid username to continue.
            </div>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 12px 18px rgba(37, 99, 235, 0.35)'
            }}
          >
            Enter Office
          </button>
        </form>
      </div>
    </div>
  );
}
