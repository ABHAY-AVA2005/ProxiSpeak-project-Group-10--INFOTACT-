import { useMemo, useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import VirtualOffice from "./VirtualOffice";
import { AudioControls } from "./components/AudioControls";
import { useMediaStream } from "./hooks/useMediaStream";

const navItems = [
  { id: "Office", icon: "◉", label: "Office", description: "Open the live office floor" },
  { id: "Team", icon: "◎", label: "Team", description: "Review the active office members" },
  { id: "Chat", icon: "◌", label: "Chat", description: "Send quick team messages" },
  { id: "Meetings", icon: "▣", label: "Meetings", description: "Create or join room-based meetings" },
  { id: "Settings", icon: "⚙", label: "Settings", description: "Update preferences and workspace mode" },
];

const palette = ["purple", "pink", "gold", "mint", "amber", "teal", "salmon", "sky", "lavender"];
const baseRooms = [
  { id: "Focus Room", name: "Focus Room", x: 450, y: 96, width: 250, height: 220, fill: "rgba(194, 220, 201, 0.92)" },
  { id: "Lounge", name: "Lounge", x: 85, y: 360, width: 255, height: 150, fill: "rgba(214, 199, 177, 0.95)" },
  { id: "Open Work", name: "Open Work", x: 660, y: 360, width: 255, height: 150, fill: "rgba(214, 219, 208, 0.9)" },
];

function App() {
  const [username, setUsername] = useState(() => sessionStorage.getItem("proxispeak_username") || "");
  const [roomName, setRoomName] = useState(() => sessionStorage.getItem("proxispeak_room") || "Team Alpha");
  const [activeTab, setActiveTab] = useState("Office");
  const [activeRoom, setActiveRoom] = useState("Focus Room");
  const [officeRooms, setOfficeRooms] = useState(baseRooms);
  const [roomDraft, setRoomDraft] = useState("");
  const [themeMode, setThemeMode] = useState("dark");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [presenceSearch, setPresenceSearch] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [settings, setSettings] = useState({
    autoJoinAudio: true,
    focusMode: false,
    quietHours: false,
    desktopAlerts: true,
    screenShare: false,
    doNotDisturb: false,
  });
  const [notifications, setNotifications] = useState([]);
  const { localStream, isMuted, permissionGranted, error, startAudio, toggleMute, volumeLevel, setVolumeLevel } = useMediaStream();

  const activeRoomName = roomName.trim() || "Team Alpha";
  const presenceUsers = useMemo(() => {
    if (onlineUsers.length > 0) return onlineUsers;
    return [{ username, isSelf: true, status: "In office" }];
  }, [onlineUsers, username]);

  const filteredUsers = useMemo(() => {
    const query = presenceSearch.trim().toLowerCase();
    if (!query) return presenceUsers;
    return presenceUsers.filter((user) => {
      const usernameText = (user.username || "").toLowerCase();
      return usernameText.includes(query);
    });
  }, [presenceSearch, presenceUsers]);

  const handleJoin = (name, room) => {
    const cleanRoom = (room || "Team Alpha").trim() || "Team Alpha";
    const cleanName = (name || "").trim();
    sessionStorage.setItem("proxispeak_username", cleanName);
    sessionStorage.setItem("proxispeak_room", cleanRoom);
    setUsername(cleanName);
    setRoomName(cleanRoom);
    setActiveRoom(cleanRoom);
  };

  const handleLeave = () => {
    sessionStorage.removeItem("proxispeak_username");
    sessionStorage.removeItem("proxispeak_room");
    setUsername("");
    setRoomName("Team Alpha");
    setActiveRoom("Focus Room");
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

  const addNotification = (title, detail) => {
    setNotifications((current) => [{ id: Date.now(), title, detail }, ...current].slice(0, 8));
  };

  const handleCreateRoom = (event) => {
    event.preventDefault();
    const cleanName = roomDraft.trim();
    if (!cleanName) return;

    const customRoom = {
      id: cleanName,
      name: cleanName,
      x: 220 + ((officeRooms.length % 3) * 135),
      y: 140 + ((officeRooms.length % 2) * 95),
      width: 220,
      height: 150,
      fill: "rgba(177, 212, 227, 0.82)",
    };

    setOfficeRooms((current) => {
      const existing = current.some((room) => room.name.toLowerCase() === cleanName.toLowerCase());
      if (existing) return current;
      return [...current, customRoom];
    });

    setActiveRoom(cleanName);
    setRoomName(cleanName);
    setActiveTab("Office");
    setRoomDraft("");
    addNotification(`${cleanName} ready`, `Your avatar is now positioned inside ${cleanName}.`);
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const trimmed = draftMessage.trim();
    if (!trimmed) return;
    setChatMessages((current) => [...current, { id: Date.now(), sender: "You", text: trimmed, time: "Now" }]);
    setDraftMessage("");
    addNotification("Message sent", "Your message was shared to the office chat.");
  };

  const handleToggleSetting = (key) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
    addNotification("Preference updated", `Updated ${key.replace(/([A-Z])/g, " $1").trim()}.`);
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
                  <button type="button" className="secondary-button" title="Message teammate — start a direct note with this person." >Message</button>
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
              title="Message composer — send a quick team update."
            />
            <button type="submit" title="Send message — share your note with the office.">Send</button>
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

          <form onSubmit={handleCreateRoom} className="meeting-form">
            <label className="meeting-room-field">
              <span>Create office room</span>
              <input
                type="text"
                value={roomDraft}
                onChange={(event) => setRoomDraft(event.target.value)}
                placeholder="e.g. Design Review"
                title="Create room — type a room name and place your avatar there instantly."
              />
            </label>
            <button type="submit" title="Create room — add a workspace room to the office map.">Create room</button>
          </form>

          <div className="meeting-list">
            {officeRooms.map((room) => (
              <div className="meeting-item" key={room.id}>
                <div>
                  <strong>{room.name}</strong>
                  <small>{room.name === activeRoom ? "Active location" : "Available"}</small>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setActiveRoom(room.name);
                    setRoomName(room.name);
                    setActiveTab("Office");
                  }}
                  title={`Open ${room.name} — jump your avatar directly into this room.`}
                >
                  {room.name === activeRoom ? "Selected" : "Open"}
                </button>
              </div>
            ))}
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
            <label className="setting-row" title="Theme mode — switch between light and dark workspace layouts.">
              <span>Theme mode</span>
              <button
                type="button"
                className="theme-toggle"
                onClick={() => setThemeMode((current) => (current === "dark" ? "light" : "dark"))}
              >
                {themeMode === "dark" ? "Dark" : "Light"}
              </button>
            </label>

            {[
              ["autoJoinAudio", "Auto-join audio", "Enable microphone automatically when you enter the office."],
              ["focusMode", "Focus mode", "Reduce distractions and keep notifications minimal."],
              ["quietHours", "Quiet hours", "Mute non-urgent reminders during focused work."],
              ["desktopAlerts", "Desktop alerts", "Show alert banners from the office workspace."],
              ["screenShare", "Screen share", "Let teammates view your current workspace."],
              ["doNotDisturb", "Do not disturb", "Pause incoming chat and call notifications."],
            ].map(([key, label, description]) => (
              <label key={key} className="setting-row" title={`${label} — ${description}`}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={() => handleToggleSetting(key)}
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
    <div className={`proxi-app-shell theme-${themeMode}`}>
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
              title={`${item.label} — ${item.description}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <button className="sidebar-collapse" type="button" aria-label="Collapse sidebar" title="Collapse sidebar — hide the left navigation panel.">
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
            <button
              type="button"
              className="toolbar-icon volume-btn"
              aria-label="Volume down"
              onClick={() => setVolumeLevel((current) => Math.max(0, current - 10))}
              title="Volume down — lower the active microphone level."
            >
              −
            </button>
            <button
              type="button"
              className="toolbar-icon volume-btn"
              aria-label="Volume up"
              onClick={() => setVolumeLevel((current) => Math.min(100, current + 10))}
              title="Volume up — increase the active microphone level."
            >
              +
            </button>
            <AudioControls
              isMuted={isMuted}
              toggleMute={toggleMute}
              permissionGranted={permissionGranted}
              startAudio={startAudio}
              error={error}
            />
            <button className="pill-button fill" type="button" title={`Current room — ${activeRoomName}.`}>
              <span className="tiny-dot" />
              {activeRoomName}
            </button>
            <button className="pill-button" type="button" title={`Occupancy — ${presenceUsers.length} member(s) online.`}>
              <span className="tiny-dot green" />
              {presenceUsers.length} Online
            </button>
          </div>

          <div className="header-tools">
            <button
              className="toolbar-icon"
              type="button"
              aria-label="Notifications"
              onClick={() => {
                setNotificationOpen((current) => !current);
                setProfileOpen(false);
              }}
              title="Notifications — review the latest office updates."
            >
              🔔
            </button>
            <button
              className="profile-pill"
              type="button"
              aria-label="Profile"
              onClick={() => {
                setProfileOpen((current) => !current);
                setNotificationOpen(false);
              }}
              title={`Profile — manage your ${username} account and workspace details.`}
            >
              <span className="profile-avatar">{username.charAt(0).toUpperCase()}</span>
            </button>
          </div>
        </header>

        {notificationOpen && (
          <div className="top-panel-popover">
            <strong>Notifications</strong>
            {notifications.length > 0 ? (
              <div className="popover-list">
                {notifications.map((item) => (
                  <div key={item.id} className="popover-row">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No new notifications.</div>
            )}
          </div>
        )}

        {profileOpen && (
          <div className="top-panel-popover profile-panel">
            <strong>Profile</strong>
            <div className="profile-summary">
              <span className="profile-avatar large">{username.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{username}</strong>
                <small>{activeRoomName}</small>
              </div>
            </div>
            <div className="profile-meta">
              <span>Theme: {themeMode}</span>
              <span>status: online</span>
            </div>
          </div>
        )}

        <main className="workspace-grid">
          <section className="office-stage">
            <div className="office-map-frame">
              {activeTab === "Office" ? (
                <VirtualOffice
                  username={username}
                  earshotRadius={120}
                  localStream={localStream}
                  onUsersChange={handleUsersChange}
                  meetingRooms={officeRooms}
                  spawnRoom={activeRoom}
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
              <input
                type="text"
                value={presenceSearch}
                onChange={(event) => setPresenceSearch(event.target.value)}
                placeholder="Search teammates..."
                title="Search teammates — filter the live office list."
              />
            </div>

            <div className="presence-list">
              {filteredUsers.map((user, index) => {
                const displayName = user.username || `Guest ${index + 1}`;
                const accent = user.isSelf ? "purple" : palette[index % palette.length];
                return (
                  <div className="presence-item" key={user.socketId || `${displayName}-${index}`} title={`${displayName} — ${user.isSelf ? "You are in office" : user.status || "In office"}`}>
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
          <div className="proximity-box" aria-label="Proximity settings" title="Proximity — adjust your local listening radius.">
            <span className="signal-bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="proximity-text">Proximity: 120px</span>
            <span className="caret">⌄</span>
          </div>

          <div className="controls-right">
            <button className="compact-action end-call" type="button" aria-label="End call" onClick={handleLeave} title="End call — leave the office and return to join screen.">
              <span>✕</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
