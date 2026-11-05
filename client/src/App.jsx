import { useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import VirtualOffice from "./VirtualOffice";
import { AudioControls } from "./components/AudioControls";
import { useMediaStream } from "./hooks/useMediaStream";

const navItems = [
  { id: "Office", icon: "◉", label: "Office" },
  { id: "Team", icon: "◎", label: "Team" },
  { id: "Chat", icon: "◌", label: "Chat" },
  { id: "Meetings", icon: "▣", label: "Meetings" },
  { id: "Settings", icon: "⚙", label: "Settings" },
];

const palette = ["purple", "pink", "gold", "mint", "amber", "teal", "salmon", "sky", "lavender"];

function App() {
  const [username, setUsername] = useState(() => sessionStorage.getItem("proxispeak_username") || "");
  const [roomName, setRoomName] = useState(() => sessionStorage.getItem("proxispeak_room") || "Team Alpha");
  const [activeTab, setActiveTab] = useState("Office");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([
    { id: 1, sender: "System", text: "Welcome to the virtual office. Start a conversation nearby.", time: "Now" },
    { id: 2, sender: "Ava", text: "Morning! I’m setting up the design review in the focus room.", time: "2m ago" },
  ]);
  const [draftMessage, setDraftMessage] = useState("");
  const [settings, setSettings] = useState({ autoJoinAudio: true, focusMode: false, quietHours: false });
  const { localStream, isMuted, permissionGranted, error, startAudio, toggleMute } = useMediaStream();

  const activeRoomName = roomName.trim() || "Team Alpha";
  const presenceUsers = onlineUsers.length > 0
    ? onlineUsers
    : [{ username, isSelf: true, status: "In office" }];

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
    setActiveTab("Office");
  };

  const handleUsersChange = (users) => {
    const nextUsers = Array.isArray(users) ? users : [];
    if (!nextUsers.length) {
      setOnlineUsers([{ username, isSelf: true, status: "In office" }]);
      return;
    }
    setOnlineUsers(nextUsers);
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const trimmed = draftMessage.trim();
    if (!trimmed) return;
    setChatMessages((current) => [
      ...current,
      { id: Date.now(), sender: "You", text: trimmed, time: "Now" },
    ]);
    setDraftMessage("");
  };

  const renderTabContent = () => {
    if (activeTab === "Team") {
      return (
        <div className="workspace-card list-card">
          <div className="card-header-row">
            <h2>Team directory</h2>
            <span>{presenceUsers.length} online</span>
          </div>
          <div className="detail-list">
            {presenceUsers.map((user, index) => {
              const displayName = user.username || `Guest ${index + 1}`;
              return (
                <div className="detail-row" key={user.socketId || `${displayName}-${index}`}>
                  <div className={`presence-avatar avatar-${user.isSelf ? "purple" : palette[index % palette.length]}`}>
                    {displayName
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div className="detail-copy">
                    <strong>{user.isSelf ? `${displayName} (you)` : displayName}</strong>
                    <span>{user.isSelf ? "In office" : user.status || "In office"}</span>
                  </div>
                  <button type="button" className="secondary-button">Message</button>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (activeTab === "Chat") {
      return (
        <div className="workspace-card chat-card">
          <div className="card-header-row">
            <h2>Workspace chat</h2>
            <span>Live</span>
          </div>
          <div className="chat-list">
            {chatMessages.map((message) => (
              <div key={message.id} className={`chat-item ${message.sender === "You" ? "self" : ""}`}>
                <div className="chat-bubble">
                  <strong>{message.sender}</strong>
                  <p>{message.text}</p>
                  <small>{message.time}</small>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendMessage} className="chat-form">
            <input
              type="text"
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Write a message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      );
    }

    if (activeTab === "Meetings") {
      return (
        <div className="workspace-card meeting-card">
          <div className="card-header-row">
            <h2>Meetings</h2>
            <span>Today</span>
          </div>
          <div className="meeting-list">
            <div className="meeting-item">
              <div>
                <strong>Design sync</strong>
                <small>Focus Room • 10:30 AM</small>
              </div>
              <button type="button" className="primary-button">Join</button>
            </div>
            <div className="meeting-item">
              <div>
                <strong>Team standup</strong>
                <small>Open Work • 12:00 PM</small>
              </div>
              <button type="button" className="primary-button">Join</button>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === "Settings") {
      return (
        <div className="workspace-card settings-card">
          <div className="card-header-row">
            <h2>Settings</h2>
            <span>Preferences</span>
          </div>
          <div className="setting-list">
            {[
              ["autoJoinAudio", "Auto-join audio"],
              ["focusMode", "Focus mode"],
              ["quietHours", "Quiet hours"],
            ].map(([key, label]) => (
              <label key={key} className="setting-row">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={() =>
                    setSettings((current) => ({
                      ...current,
                      [key]: !current[key],
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </div>
      );
    }

    return null;
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
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activeTab === item.id ? "active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
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
              {presenceUsers.length} Online
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
              {activeTab === "Office" ? (
                <VirtualOffice
                  username={username}
                  earshotRadius={120}
                  localStream={localStream}
                  onUsersChange={handleUsersChange}
                />
              ) : (
                renderTabContent()
              )}
            </div>
          </section>

          <aside className="presence-panel">
            <div className="presence-head">
              <span className="online-dot small" />
              <strong>Online Users ({presenceUsers.length})</strong>
            </div>

            <div className="presence-search">
              <span>⌕</span>
              <input type="text" value="Search teammates..." readOnly />
            </div>

            <div className="presence-list">
              {presenceUsers.map((user, index) => {
                const displayName = user.username || `Guest ${index + 1}`;
                const accent = user.isSelf ? "purple" : palette[index % palette.length];
                return (
                  <div className="presence-item" key={user.socketId || `${displayName}-${index}`}>
                    <div className={`presence-avatar avatar-${accent}`}>
                      {displayName
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>

                    <div className="presence-meta">
                      <strong>{user.isSelf ? `${displayName} (you)` : displayName}</strong>
                      <span>{user.isSelf ? "In office" : user.status || "In office"}</span>
                    </div>

                    <div className="signal-block" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                );
              })}
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
