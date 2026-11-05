import { useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import VirtualOffice from "./VirtualOffice";
import { AudioControls } from "./components/AudioControls";
import { useMediaStream } from "./hooks/useMediaStream";

const teamMembers = [
  { name: "Abhishek Bhalla", status: "In Office • Near You", accent: "purple" },
  { name: "Tanvi Dighe", status: "In Office • 12m ago", accent: "pink" },
  { name: "Kajal Kumari Singh", status: "In Office • 14m ago", accent: "gold" },
  { name: "Sai Kiran Godavarthi", status: "In Office • 20m ago", accent: "mint" },
  { name: "Ganesh Dharavath", status: "In Office • 25m ago", accent: "amber" },
  { name: "Rohit Sharma", status: "In Office • 30m ago", accent: "teal" },
  { name: "Harsha Vardhan", status: "In Office • 32m ago", accent: "salmon" },
  { name: "Deepika Reddy", status: "In Office • 40m ago", accent: "sky" },
  { name: "Venkatesh", status: "In Office • 42m ago", accent: "lavender" },
];

function App() {
  const [username, setUsername] = useState(() => sessionStorage.getItem("proxispeak_username") || "");
  const [roomName, setRoomName] = useState(() => sessionStorage.getItem("proxispeak_room") || "Team Alpha");
  const { localStream, isMuted, permissionGranted, error, startAudio, toggleMute } = useMediaStream();

  const activeRoomName = roomName.trim() || "Team Alpha";

  const handleJoin = (name, room) => {
    const cleanRoom = (room || "Team Alpha").trim() || "Team Alpha";
    const cleanName = (name || "").trim();
    sessionStorage.setItem("proxispeak_username", cleanName);
    sessionStorage.setItem("proxispeak_room", cleanRoom);
    setUsername(cleanName);
    setRoomName(cleanRoom);
  };

  const handleLeave = () => {
    sessionStorage.removeItem("proxispeak_username");
    sessionStorage.removeItem("proxispeak_room");
    setUsername("");
    setRoomName("Team Alpha");
  };

  if (!username) {
    return <JoinScreen onJoin={handleJoin} />;
  }

  return (
    <div className="proxi-app-shell">
      <aside className="proxi-sidebar">
        <div className="brand-block">
          <div className="brand-signal" aria-hidden="true">
            <span className="bar bar-1" />
            <span className="bar bar-2" />
            <span className="bar bar-3" />
            <span className="bar bar-4" />
          </div>
          <div className="brand-text">
            <h1>ProxiSpeak</h1>
            <span>Virtual Office</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <button className="nav-item active" type="button">
            <span className="nav-icon">◉</span>
            Office
          </button>
          <button className="nav-item" type="button">
            <span className="nav-icon">◎</span>
            Team
          </button>
          <button className="nav-item" type="button">
            <span className="nav-icon">◌</span>
            Chat
          </button>
          <button className="nav-item" type="button">
            <span className="nav-icon">▣</span>
            Meetings
          </button>
          <button className="nav-item" type="button">
            <span className="nav-icon">⚙</span>
            Settings
          </button>
        </nav>

        <button className="sidebar-collapse" type="button" aria-label="Collapse sidebar">
          ‹
        </button>

        <div className="online-card">
          <span className="online-dot" />
          <div>
            <strong>You&apos;re Online</strong>
            <small>In Office • Floor 1</small>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="footer-wave" />
          <div className="footer-copy">
            <span className="footer-mark">✦</span>
            <span>Build. Connect. Grow.</span>
          </div>
        </div>
      </aside>

      <div className="workspace-panel">
        <header className="main-header">
          <div className="header-pills">
            <AudioControls
              isMuted={isMuted}
              toggleMute={toggleMute}
              permissionGranted={permissionGranted}
              startAudio={startAudio}
              error={error}
            />
            <button className="pill-button fill" type="button">
              <span className="tiny-dot" />
              {activeRoomName}
            </button>
            <button className="pill-button" type="button">
              <span className="tiny-dot green" />
              50 Online
            </button>
          </div>

          <div className="header-tools">
            <button className="toolbar-icon" type="button" aria-label="Search">
              ⌕
            </button>
            <button className="toolbar-icon" type="button" aria-label="Notifications">
              🔔
            </button>
            <button className="profile-pill" type="button" aria-label="Profile">
              <span className="profile-avatar">{username.charAt(0).toUpperCase()}</span>
            </button>
          </div>
        </header>

        <main className="workspace-grid">
          <section className="office-stage">
            <div className="office-map-frame">
              <VirtualOffice username={username} earshotRadius={120} localStream={localStream} />
            </div>
          </section>

          <aside className="presence-panel">
            <div className="presence-head">
              <span className="online-dot small" />
              <strong>Online Users (50)</strong>
            </div>

            <div className="presence-search">
              <span>⌕</span>
              <input type="text" value="Search teammates..." readOnly />
            </div>

            <div className="presence-list">
              {teamMembers.map((member) => (
                <div className="presence-item" key={member.name}>
                  <div className={`presence-avatar avatar-${member.accent}`}>
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </div>

                  <div className="presence-meta">
                    <strong>{member.name}</strong>
                    <span>{member.status}</span>
                  </div>

                  <div className="signal-block" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </main>

        <footer className="bottom-controls">
          <div className="controls-left">
            <button className="compact-action mic" type="button" aria-label="Microphone">
              <span>🎙</span>
            </button>
            <button className="compact-action muted" type="button" aria-label="Muted microphone">
              <span>🔇</span>
            </button>
          </div>

          <div className="proximity-box" aria-label="Proximity settings">
            <span className="signal-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="proximity-text">Proximity: 120px</span>
            <span className="caret">⌄</span>
          </div>

          <div className="controls-right">
            <button className="compact-action end-call" type="button" aria-label="End call" onClick={handleLeave}>
              <span>✕</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
