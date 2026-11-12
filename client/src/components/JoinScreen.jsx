import { useState } from 'react';

export function JoinScreen({ onJoin }) {
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanName = username.trim();
    const cleanRoom = roomName.trim();
    if (!cleanName || !cleanRoom) {
      setIsError(true);
      return;
    }
    setIsError(false);
    onJoin(cleanName, cleanRoom);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f1efe9',
      color: '#1c2a2a',
      fontFamily: 'Inter, system-ui, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '1250px',
        display: 'grid',
        gridTemplateColumns: '1.05fr 1.15fr',
        gap: '32px',
        alignItems: 'center'
      }}>
        <div style={{
          paddingLeft: '12px'
        }}>
          <div style={{
            fontSize: 'clamp(3.5rem, 7vw, 8.2rem)',
            lineHeight: '0.9',
            letterSpacing: '-0.08em',
            fontWeight: 700,
            color: '#1d2b2a',
            marginBottom: '22px'
          }}>
            <div style={{ opacity: 0.95 }}>Conversations</div>
            <div>happen</div>
            <div style={{ color: '#234f4a' }}>along the way.</div>
          </div>

          <p style={{
            margin: '0 0 28px',
            maxWidth: '470px',
            fontSize: '1.15rem',
            color: '#455952',
            lineHeight: '1.5'
          }}>
            A shared virtual office where you can wander, say hello, and hear the people nearby.
          </p>

          <div style={{
            width: '100%',
            maxWidth: '470px',
            background: 'rgba(255,255,255,0.35)',
            border: '1px solid rgba(0, 0, 0, 0.8)',
            borderRadius: '22px',
            padding: '18px 18px 16px'
          }}>
            <div style={{
              fontSize: '1.06rem',
              fontWeight: 700,
              color: '#1f2d2b',
              marginBottom: '12px'
            }}>
              Step into your team space
            </div>

            <div style={{
              fontSize: '0.82rem',
              color: '#62766e',
              marginBottom: '12px'
            }}>
              Choose a name and room to get started.
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '0.82rem', color: '#5f706b', marginBottom: '8px' }}>Your name</div>
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
                    padding: '14px 14px',
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

              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.82rem', color: '#5f706b', marginBottom: '8px' }}>Office room</div>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Enter room name"
                  maxLength={40}
                  required
                  style={{
                    width: '100%',
                    padding: '14px 14px',
                    borderRadius: '12px',
                    background: '#f9f7f5',
                    border: '1px solid rgba(0, 0, 0, 0.8)',
                    color: '#455a54',
                    fontSize: '1.02rem',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
              </div>

              {isError && (
                <div style={{ color: '#cf5a5a', fontSize: '0.76rem', marginBottom: '12px' }}>
                  Please enter your name and room name to continue.
                </div>
              )}

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #1f4d48, #1f5a52)',
                  color: '#ecfffb',
                  fontWeight: 700,
                  fontSize: '1.02rem',
                  cursor: 'pointer',
                  boxShadow: '0 12px 24px rgba(24, 66, 58, 0.18)'
                }}
              >
                Enter the office →
              </button>
            </form>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '700px',
            background: '#f4f2ee',
            borderRadius: '24px',
            border: '1px solid rgba(0, 0, 0, 0.8)',
            padding: '20px 26px 18px',
            boxShadow: '0 24px 50px rgba(24, 30, 27, 0.08)'
          }}>
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

            <div style={{
              background: '#f5f1eb',
              borderRadius: '20px',
              border: '1px solid rgba(88, 102, 96, 0.16)',
              minHeight: '440px',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                position: 'absolute',
                left: '22px',
                right: '22px',
                top: '18px',
                bottom: '18px',
                borderRadius: '16px',
                background: 'linear-gradient(180deg, rgba(117, 145, 134, 0.12), rgba(117, 145, 134, 0.03))',
                border: '1px solid rgba(0, 0, 0, 0.8)'
              }} />

              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: '52%',
                height: '58%',
                transform: 'translate(-50%, -50%)',
                background: 'rgba(180, 204, 171, 0.22)',
                border: '1px solid rgba(0, 0, 0, 0.8)',
                borderRadius: '16px',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)'
              }} />

              <div style={{
                position: 'absolute',
                left: '28%',
                top: '28%',
                width: '34%',
                height: '26%',
                background: '#d1e1d6',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.8)'
              }} />

              <div style={{
                position: 'absolute',
                left: '28%',
                top: '60%',
                width: '32%',
                height: '18%',
                background: '#ccbdab',
                borderRadius: '12px',
                border: '1px solid rgba(120, 105, 88, 0.18)'
              }} />

              <div style={{
                position: 'absolute',
                right: '18%',
                top: '34%',
                width: '20%',
                height: '18%',
                background: '#d6d0c2',
                borderRadius: '12px',
                border: '1px solid rgba(123, 112, 98, 0.18)'
              }} />

              <div style={{
                display: 'flex',
                gap: '10px',
                position: 'absolute',
                bottom: '28px',
                right: '26px',
                padding: '10px 14px',
                borderRadius: '999px',
                background: 'rgba(255,255,255,0.72)',
                border: '1px solid rgba(120, 125, 121, 0.18)',
                boxShadow: '0 10px 18px rgba(35, 39, 35, 0.08)'
              }}>
                <span style={{ fontSize: '18px' }}>🔇</span>
                <span style={{ fontSize: '18px' }}>🎙️</span>
                <span style={{ fontSize: '18px' }}>⋯</span>
              </div>

              <div style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '15px',
                height: '15px',
                borderRadius: '50%',
                background: '#7cc59a',
                boxShadow: '0 0 0 12px rgba(124, 197, 154, 0.18)'
              }} />

              <div style={{
                position: 'absolute',
                left: '50%',
                top: '72%',
                transform: 'translateX(-50%)',
                background: 'rgba(255,255,255,0.62)',
                border: '1px solid rgba(99, 112, 108, 0.18)',
                borderRadius: '999px',
                padding: '8px 16px',
                fontSize: '0.82rem',
                color: '#4b544f',
                fontWeight: 600
              }}>
                Nearby conversation
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
