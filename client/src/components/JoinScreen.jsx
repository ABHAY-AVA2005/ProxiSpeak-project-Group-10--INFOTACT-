import { useEffect, useState } from 'react';
import heroImage from '../assets/proxispeak-hero.png';

export function JoinScreen({ onJoin, rooms, themeMode = 'light' }) {
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('join-page-active');
    return () => root.classList.remove('join-page-active');
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = username.trim();
    const cleanRoom = roomName.trim().toLowerCase();
    if (!cleanName || !cleanRoom) {
      setIsError(true);
      return;
    }
    setIsError(false);
    onJoin(cleanName, cleanRoom);
  };

  return (
    <div className={`join-screen-page theme-${themeMode}`}>
      <div className="join-screen-layout">
        <div className="join-screen-copy">
          <h1 className="join-screen-title">
            <span>Conversations</span>
            <span>happen</span>
            <span>along the way.</span>
          </h1>

          <p className="join-screen-subtitle">
            A shared virtual office where you can wander, say hello, and hear the people nearby.
          </p>

          <div className="join-form-card">
            <div className="join-form-title">
              Step into your team space
            </div>

            <div className="join-form-subtitle">
              Choose a name and room to get started.
            </div>

            <form onSubmit={handleSubmit}>
              <div className="join-field">
                <div className="join-field-label">Your name</div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (isError && e.target.value.trim()) setIsError(false);
                  }}
                  placeholder="Enter name"
                  maxLength={30}
                  aria-invalid={isError}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: '#e8f1ee',
                    border: isError ? '1px solid #e57373' : '1px solid rgba(0, 0, 0, 0.8)',
                    color: '#243530',
                    fontSize: '1.02rem',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                  required
                />
              </div>

              <div className="join-field join-room-field">
                <div className="join-field-label">Office room</div>
                <select
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  aria-label="Office room"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: '#f9f7f5',
                    border: '1px solid rgba(0, 0, 0, 0.8)',
                    color: '#455a54',
                    fontSize: '1.02rem',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>Select an office room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.name.trim().toLowerCase()}>{room.name}</option>
                  ))}
                </select>
              </div>

              {isError && (
                <div style={{ color: '#cf5a5a', fontSize: '0.76rem', marginBottom: '12px' }}>
                  Please enter your name and room name to continue.
                </div>
              )}

              <button
                type="submit"
                className="join-submit-button"
              >
                Enter the office →
              </button>
            </form>
          </div>
        </div>

        <div className="join-screen-hero" style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div className="join-hero-card">
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              color: '#3e564f',
              fontSize: '0.74rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 700
            }}>
              <span>Team office</span>
              <span>Ready</span>
            </div>

            <div className="join-hero-image-wrap">
              <img
                src={heroImage}
                alt="Two colleagues speaking across a table inside a colorful conversation symbol"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
