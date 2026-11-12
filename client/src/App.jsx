import { useEffect, useMemo, useRef, useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import VirtualOffice from "./VirtualOffice";
import { AudioControls } from "./components/AudioControls";
import { useMediaStream } from "./hooks/useMediaStream";

const navItems = [
  { id: "Office", icon: "⊞", label: "Office" },
  { id: "Team", icon: "◎", label: "Team" },
  { id: "Chat", icon: "◌", label: "Chat" },
  { id: "Meetings", icon: "▣", label: "Meetings" },
  { id: "Settings", icon: "⚙", label: "Settings" },
];

const palette = ["purple","pink","gold","mint","amber","teal","salmon","sky","lavender"];

const baseRooms = [
  { id: "Meeting Room", name: "Meeting Room", x: 18, y: 18, width: 285, height: 187, fill: "rgba(230,235,245,0.92)" },
  { id: "Focus Zone", name: "Focus Zone", x: 697, y: 18, width: 285, height: 187, fill: "rgba(230,235,245,0.92)" },
  { id: "Open Work", name: "Open Workspace", x: 310, y: 200, width: 380, height: 185, fill: "rgba(240,238,252,0.92)" },
  { id: "Lounge", name: "Lounge", x: 18, y: 395, width: 285, height: 190, fill: "rgba(235,230,245,0.92)" },
  { id: "Pantry", name: "Pantry", x: 697, y: 395, width: 285, height: 190, fill: "rgba(235,230,245,0.92)" },
];

const PROXIMITY_OPTIONS = [50, 75, 100, 150, 200];

function App() {
  const [username, setUsername] = useState(() => sessionStorage.getItem("proxispeak_username") || "");
  const [roomName, setRoomName] = useState(() => {
    const storedRoom = sessionStorage.getItem("proxispeak_room")?.trim().toLowerCase();
    return baseRooms.find((room) => room.name.toLowerCase() === storedRoom)?.name.toLowerCase()
      || baseRooms[0].name.toLowerCase();
  });
  const [activeTab, setActiveTab] = useState("Office");
  const [activeRoom, setActiveRoom] = useState("Meeting Room");
  const [officeRooms] = useState(baseRooms);
  const [themeMode] = useState("dark");
  const [avatarColor, setAvatarColor] = useState("#2563eb");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [presenceSearch, setPresenceSearch] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [chatConnected, setChatConnected] = useState(false);
  const [chatRoomReady, setChatRoomReady] = useState(false);
  const [chatServerOutdated, setChatServerOutdated] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatScope, setChatScope] = useState("room");
  const [earshotRadius, setEarshotRadius] = useState(100);
  const [proximityOpen, setProximityOpen] = useState(false);
  const [nearbyVoicesExpanded, setNearbyVoicesExpanded] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [settings, setSettings] = useState({
    autoJoinAudio: true, focusMode: false, quietHours: false,
    desktopAlerts: true, screenShare: false, doNotDisturb: false,
  });
  const [notifications, setNotifications] = useState([]);
  const [presenceClock, setPresenceClock] = useState(0);
  const screenShareVideoRef = useRef(null);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [remoteScreenShare, setRemoteScreenShare] = useState(null);
  const socketRef = useRef(null);
  const chatScopeRef = useRef("room");
  const chatListRef = useRef(null);

  const {
    localStream, isMuted, permissionGranted, error,
    startAudio, toggleMute, speakerEnabled, speakerVolume,
    setSpeakerVolume, toggleSpeakerMute,
  } = useMediaStream();

  useEffect(() => {
    const video = screenShareVideoRef.current;
    if (!video) return;
    const stream = screenShareStream || remoteScreenShare?.stream;
    if (stream) { video.srcObject = stream; video.play().catch((err) => console.warn("Screen share playback was blocked:", err)); }
    else { video.srcObject = null; }
  }, [screenShareStream, remoteScreenShare]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => setPresenceClock(Date.now()), 0);
    const timer = window.setInterval(() => setPresenceClock(Date.now()), 60_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const list = chatListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [chatMessages]);

  const selfStatus = settings.doNotDisturb ? "Do Not Disturb" : settings.focusMode ? "Focus" : "Available";
  const presenceUsers = useMemo(() => {
    const baseList = onlineUsers.length > 0 ? onlineUsers : [{ username, isSelf: true, status: selfStatus }];
    return baseList.map((user, index) => ({
      ...user,
      status: user.isSelf ? selfStatus : user.status || "Available",
      label: user.isSelf ? `${user.username || username} (you)` : user.username || `Guest ${index + 1}`,
    }));
  }, [onlineUsers, selfStatus, username]);

  const filteredUsers = useMemo(() => {
    const query = presenceSearch.trim().toLowerCase();
    if (!query) return presenceUsers;
    return presenceUsers.filter(u => (u.username || "").toLowerCase().includes(query));
  }, [presenceSearch, presenceUsers]);

  const handleJoin = (name, room) => {
    const cleanRoom = room.trim().toLowerCase();
    const cleanName = (name || "").trim();
    sessionStorage.setItem("proxispeak_username", cleanName);
    sessionStorage.setItem("proxispeak_room", cleanRoom);
    setUsername(cleanName);
    setRoomName(cleanRoom);
    setActiveRoom(cleanRoom);
  };

  const handleLeave = () => {
    screenShareStream?.getTracks().forEach((track) => track.stop());
    setScreenShareStream(null);
    setRemoteScreenShare(null);
    sessionStorage.removeItem("proxispeak_username");
    sessionStorage.removeItem("proxispeak_room");
    setUsername("");
    setRoomName(baseRooms[0].name.toLowerCase());
    setActiveRoom("Meeting Room");
    setActiveTab("Office");
  };

  const handleUsersChange = (users) => {
    const nextUsers = Array.isArray(users) ? users : [];
    if (!nextUsers.length) {
      setOnlineUsers([{ username, isSelf: true, status: "In office" }]);
      return;
    }
    setOnlineUsers(nextUsers);
    // Count nearby (non-self) users — VirtualOffice passes all connected users; we filter by presence
    const others = nextUsers.filter(u => !u.isSelf);
    setNearbyCount(others.length);
  };

  const addNotification = (title, detail) => {
    if (settings.focusMode || settings.doNotDisturb) return;
    setNotifications(c => [{ id: Date.now(), title, detail }, ...c].slice(0, 8));
  };

  const handleChatMessage = (msg) => {
    if (!msg || !msg.text) return;
    const isSelf = msg.senderId
      ? msg.senderId === socketRef.current?.id
      : msg.sender === username;
    setChatMessages((current) => {
      if (msg.id && current.some((message) => message.id === msg.id)) return current;
      return [...current, {
        id: msg.id || `${Date.now()}-${Math.random()}`,
        isSelf,
        scope: msg.scope,
        sender: isSelf ? "You" : msg.sender,
        text: msg.text,
        time: msg.time
          ? new Date(msg.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Now",
      }];
    });
    if (!isSelf && activeTab !== "Chat") {
      addNotification("New Chat Message", `${msg.sender}: ${msg.text.slice(0, 35)}`);
    }
  };

  const handleToggleChatScope = () => {
    const nextScope = chatScopeRef.current === "room" ? "all" : "room";
    chatScopeRef.current = nextScope;
    setChatScope(nextScope);
    setChatError("");
    const socket = socketRef.current;
    if (!socket?.connected) return;

    socket.timeout(5000).emit("chat:history", { scope: nextScope }, (error, response) => {
      if (error || !response?.ok) {
        setChatError("Could not load this chat history. Please try again.");
        return;
      }
      if (nextScope !== chatScopeRef.current) return;
      setChatMessages((current) => {
        const history = response.messages.map((message) => ({
          id: message.id,
          isSelf: message.senderId === socket.id,
          sender: message.senderId === socket.id ? "You" : message.sender,
          text: message.text,
          time: message.time
            ? new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "Now",
        }));
        const messageIds = new Set(history.map((message) => message.id));
        const arrivedWhileLoading = current.filter((message) =>
          message.scope === nextScope && !messageIds.has(message.id)
        );
        return [...history, ...arrivedWhileLoading];
      });
    });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    const trimmed = draftMessage.trim();
    if (!trimmed) return;
    if (!socketRef.current?.connected) {
      setChatError("Chat is reconnecting. Please try again when you are back online.");
      return;
    }
    setChatSending(true);
    setChatError("");
    socketRef.current.timeout(5000).emit(
      "chat:message",
      { text: trimmed, scope: chatScopeRef.current },
      (error, response) => {
      setChatSending(false);
      if (error || !response?.ok) {
        setChatError(chatServerOutdated
          ? "The chat server needs its latest update before messages can be delivered."
          : "Message could not be sent. Please try again.");
        return;
      }
      setDraftMessage((current) => current === trimmed ? "" : current);
      }
    );
  };

  const handleToggleScreenShare = async () => {
    if (screenShareStream) {
      screenShareStream.getTracks().forEach((track) => track.stop());
      setScreenShareStream(null);
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.warn("Screen sharing is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) {
        stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        throw new Error("No screen video track was provided.");
      }
      track.addEventListener("ended", () => {
        setScreenShareStream((current) => current === stream ? null : current);
      }, { once: true });
      setScreenShareStream(stream);
    } catch (error) {
      if (error.name !== "NotAllowedError") {
        console.error("Unable to start screen sharing:", error);
      }
    }
  };

  const handleRemoteScreenShareChange = (share) => {
    setRemoteScreenShare((current) => {
      if (!share?.stream) return current?.socketId === share?.socketId ? null : current;
      return share;
    });
  };

  const handleToggleSetting = (key) => {
    setSettings(c => ({ ...c, [key]: !c[key] }));
  };

  const timeAgo = (user) => {
    if (user.isSelf) return "Near You";
    if (!Number.isFinite(user.joinedAt)) return "Online";
    const minutes = Math.max(0, Math.floor((presenceClock - user.joinedAt) / 60_000));
    return minutes === 0 ? "Just now" : `${minutes}m ago`;
  };

  if (!username) return <JoinScreen onJoin={handleJoin} rooms={officeRooms} />;

  return (
    <div className={`proxi-app-shell theme-${themeMode}`}>
      {/* ── LEFT SIDEBAR ── */}
      <aside className="proxi-sidebar">
        <div className="brand-block">
          <div className="brand-signal" aria-hidden="true">
            <span className="bar bar-1" /><span className="bar bar-2" />
            <span className="bar bar-3" /><span className="bar bar-4" />
          </div>
          <div className="brand-text">
            <h1>ProxiSpeak</h1>
            <span>Virtual Office</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map(item => (
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

        <div className="sidebar-spacer" />

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

      {/* ── MAIN CONTENT WRAPPER ── */}
      <div className="main-content">
        {/* ── TOP HEADER ── */}
        <header className="app-top-header">
          <div className="header-left">
            <button className="team-selector-btn">
              <span className="team-dot" />{roomName} <span className="caret-icon">▾</span>
            </button>
            <button className="online-count-btn">
              <span className="users-icon">👥</span>{presenceUsers.length} Online
            </button>
          </div>
          <div className="header-right">
            <button
              className={`hdr-icon-btn ${searchOpen ? "active" : ""}`}
              aria-label="Search"
              onClick={() => setSearchOpen(o => !o)}
              title="Search teammates"
            >
              🔍
            </button>
            <button className="hdr-icon-btn notif-btn" aria-label="Notifications" onClick={() => { setNotificationOpen(o => !o); setProfileOpen(false); }}>
              🔔
              {notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
            </button>
            <button className="hdr-profile-btn" aria-label="Profile" onClick={() => { setProfileOpen(o => !o); setNotificationOpen(false); }}>
              <span className="hdr-avatar">{(username[0] || "U").toUpperCase()}</span>
            </button>
          </div>

          {notificationOpen && (
            <div className="hdr-popover">
              <strong>Notifications</strong>
              {notifications.length > 0 ? notifications.map(n => (
                <div key={n.id} className="popover-row"><strong>{n.title}</strong><small>{n.detail}</small></div>
              )) : <div className="empty-state">No new notifications.</div>}
            </div>
          )}
          {profileOpen && (
            <div className="hdr-popover profile-panel">
              <strong>Profile</strong>
              <div className="profile-summary">
                <span className="profile-avatar large">{(username[0] || "U").toUpperCase()}</span>
                <div><strong>{username}</strong><small>{roomName}</small></div>
              </div>
            </div>
          )}
        </header>

        {/* ── WORKSPACE GRID ── */}
        <div className="workspace-grid">
          {/* ── OFFICE STAGE + VOICE CONTROLS ── */}
          <section className="office-stage">
            <div className="office-map-frame">
              {/* Keep VirtualOffice continuously mounted so socket and WebRTC audio NEVER disconnect when checking tabs */}
              <div style={{ display: activeTab === "Office" ? "block" : "none", width: "100%", height: "100%" }}>
                <VirtualOffice
                  username={username}
                  earshotRadius={earshotRadius}
                  localStream={localStream}
                  onUsersChange={handleUsersChange}
                  onChatMessage={handleChatMessage}
                  onSocketReady={(sock, history = [], roomReady = false, serverOutdated = false, meetingHistory = []) => {
                    socketRef.current = sock;
                    setChatConnected(Boolean(sock?.connected));
                    setChatRoomReady(roomReady);
                    setChatServerOutdated(serverOutdated);
                    if (sock && roomReady) {
                      const messages = chatScopeRef.current === "all" ? meetingHistory : history;
                      setChatMessages(messages.map((message) => ({
                        id: message.id,
                        isSelf: message.senderId === sock.id,
                        sender: message.senderId === sock.id ? "You" : message.sender,
                        scope: message.scope || (chatScopeRef.current === "all" ? "all" : "room"),
                        text: message.text,
                        time: message.time
                          ? new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Now",
                      })));
                    }
                  }}
                  roomName={roomName}
                  screenShareStream={screenShareStream}
                  onRemoteScreenShareChange={handleRemoteScreenShareChange}
                  meetingRooms={officeRooms}
                  spawnRoom={activeRoom}
                  avatarColor={avatarColor}
                />
              </div>

              {activeTab !== "Office" && (
                <div className="tab-content-wrapper">
                  {activeTab === "Team" && (
                    <div className="workspace-card">
                      <div className="card-header-row"><h2>Team directory</h2><span>{presenceUsers.length} online</span></div>
                      <div className="detail-list">
                        {presenceUsers.map((user, i) => {
                          const name = user.username || `Guest ${i+1}`;
                          return (
                            <div className="detail-row" key={user.socketId || `${name}-${i}`}>
                              <div className={`presence-avatar avatar-${user.isSelf ? "purple" : palette[i % palette.length]}`}>
                                {name.split(" ").map(p => p[0]).slice(0,2).join("").toUpperCase()}
                              </div>
                              <div className="detail-copy"><strong>{user.isSelf ? `${name} (you)` : name}</strong><span>{user.status}</span></div>
                              <button type="button" className="secondary-button">Message</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {activeTab === "Chat" && (
                    <div className="workspace-card chat-card">
                      <div className="card-header-row">
                        <div>
                          <h2>Workspace chat</h2>
                          <small>{chatScope === "all" ? "Everyone in the meeting" : `Room: ${roomName}`}</small>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span>
                            {!chatConnected
                              ? "Offline"
                              : chatServerOutdated
                                ? "Server update needed"
                                : chatRoomReady
                                  ? "Live"
                                  : "Joining room..."}
                          </span>
                          <button type="button" className="primary-button" onClick={handleToggleScreenShare}>
                            {screenShareStream ? "Stop sharing" : "Share screen"}
                          </button>
                        </div>
                      </div>
                      {screenShareStream || remoteScreenShare?.stream ? (
                        <div className="screen-share-panel">
                          <div className="card-header-row">
                            <strong>{screenShareStream ? "Your screen" : `${remoteScreenShare.username || "Teammate"}'s screen`}</strong>
                          </div>
                          <video
                            ref={(video) => {
                              screenShareVideoRef.current = video;
                              const stream = screenShareStream || remoteScreenShare?.stream;
                              if (video && stream && video.srcObject !== stream) {
                                video.srcObject = stream;
                                video.play().catch((err) => console.warn("Screen share playback was blocked:", err));
                              }
                            }}
                            autoPlay
                            playsInline
                            muted
                            className="screen-share-video"
                          />
                        </div>
                      ) : null}
                      <div className="chat-list" ref={chatListRef}>
                        {chatMessages.map(m => (
                          <div key={m.id} className={`chat-item ${m.isSelf ? "self" : ""}`}>
                            <div className="chat-bubble"><strong>{m.sender}</strong><p>{m.text}</p><small>{m.time}</small></div>
                          </div>
                        ))}
                      </div>
                      <form onSubmit={handleSendMessage} className="chat-form">
                        <input type="text" value={draftMessage} onChange={e => { setDraftMessage(e.target.value); setChatError(""); }} placeholder="Write a message..." maxLength={2000} />
                        <button type="submit" disabled={!chatConnected || chatSending || !draftMessage.trim()}>
                          {chatSending ? "Sending..." : "Send"}
                        </button>
                      </form>
                      {chatError && <p role="status" className="chat-error">{chatError}</p>}
                    </div>
                  )}
                  {activeTab === "Meetings" && (
                    <div className="workspace-card">
                      <div className="card-header-row"><h2>Meetings</h2><span>Today</span></div>
                      <div className="meeting-list">
                        {officeRooms.map(r => (
                          <div className="meeting-item" key={r.id}>
                            <div><strong>{r.name}</strong><small>{r.name === activeRoom ? "Active" : "Available"}</small></div>
                            <button type="button" className="primary-button" onClick={() => { setActiveRoom(r.name); setActiveTab("Office"); }}>
                              {r.name === activeRoom ? "Selected" : "Open"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeTab === "Settings" && (
                    <div className="workspace-card">
                      <div className="card-header-row"><h2>Settings</h2><span>Preferences</span></div>
                      <div className="setting-list">
                        {[["autoJoinAudio","Auto-join audio"],["focusMode","Focus mode"],["quietHours","Quiet hours"],["desktopAlerts","Desktop alerts"],["doNotDisturb","Do not disturb"]].map(([key, label]) => (
                          <label key={key} className="setting-row">
                            <span>{label}</span>
                            <input type="checkbox" checked={settings[key]} onChange={() => handleToggleSetting(key)} />
                          </label>
                        ))}
                        <div className="setting-row avatar-row">
                          <span>Avatar colour</span>
                          <div className="avatar-colour-picker">
                            {["#2563eb","#8b5cf6","#f97316","#10b981","#ec4899","#facc15","#ef4444"].map(c => (
                              <button key={c} type="button" className={`avatar-color-swatch ${avatarColor === c ? "selected" : ""}`} style={{ background: c }} onClick={() => setAvatarColor(c)} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── BOTTOM VOICE CONTROLS BAR ── */}
            <div className="voice-controls-bar">
              <button
                className={`voice-btn mic-btn ${isMuted ? "muted" : "active"}`}
                onClick={permissionGranted ? toggleMute : startAudio}
                title={isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                {isMuted ? "🎙️" : "🎤"}
              </button>

              <button
                className={`voice-btn speaker-btn ${!speakerEnabled ? "muted" : ""}`}
                onClick={toggleSpeakerMute}
                title="Toggle speaker"
              >
                {speakerEnabled ? "🔊" : "🔇"}
              </button>

              <div className="proximity-wrapper">
                <button
                  className="proximity-selector-btn"
                  onClick={() => setProximityOpen(o => !o)}
                >
                  <span className="prox-dot" />
                  Proximity: {earshotRadius}px <span className="caret-icon">▾</span>
                </button>
                {proximityOpen && (
                  <div className="proximity-dropdown">
                    {PROXIMITY_OPTIONS.map(val => (
                      <button
                        key={val}
                        className={`prox-option ${earshotRadius === val ? "selected" : ""}`}
                        onClick={() => { setEarshotRadius(val); setProximityOpen(false); }}
                      >
                        {val}px
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button className="voice-btn settings-btn" title="Audio settings" onClick={() => setActiveTab("Settings")}>
                ⚙
              </button>

              <button
                type="button"
                className={`chat-mode-toggle ${chatScope === "all" ? "active" : ""}`}
                onClick={handleToggleChatScope}
                aria-pressed={chatScope === "all"}
                title={`Switch to ${chatScope === "room" ? "all meeting" : "room"} chat`}
              >
                {chatScope === "room" ? "Room chat" : "All chat"}
              </button>

              <button className="voice-btn end-btn" onClick={handleLeave} title="Leave office">
                📞
              </button>
            </div>
          </section>

          {/* ── RIGHT PRESENCE PANEL ── */}
          <aside className="presence-panel">
            <div className="presence-head">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="online-dot small" />
                <strong>Online Users ({presenceUsers.length})</strong>
              </div>
              <button
                type="button"
                className={`presence-search-toggle ${searchOpen ? "active" : ""}`}
                onClick={() => setSearchOpen(o => !o)}
                title={searchOpen ? "Close search" : "Search teammates"}
                style={{
                  background: searchOpen ? "rgba(99,102,241,0.25)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  color: "#cbd5e1",
                  transition: "background 0.15s ease"
                }}
              >
                🔍
              </button>
            </div>

            {searchOpen && (
              <div className="presence-search">
                <span>🔍</span>
                <input
                  type="text"
                  autoFocus
                  value={presenceSearch}
                  onChange={e => setPresenceSearch(e.target.value)}
                  placeholder="Search teammates..."
                />
                {presenceSearch && (
                  <button
                    type="button"
                    onClick={() => setPresenceSearch("")}
                    title="Clear"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "12px",
                      padding: "0 4px"
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div className="presence-list">
              {filteredUsers.map((user, index) => {
                const name = user.username || `Guest ${index + 1}`;
                const accent = user.isSelf ? "purple" : palette[index % palette.length];
                const ago = timeAgo(user);
                return (
                  <div className="presence-item" key={user.socketId || `${name}-${index}`}>
                    <div className="presence-avatar-wrapper">
                      <div className={`presence-avatar avatar-${accent}`}>
                        {name.split(" ").map(p => p[0]).slice(0,2).join("").toUpperCase()}
                      </div>
                      <span className="online-badge" />
                    </div>
                    <div className="presence-meta">
                      <strong>{user.isSelf ? `${name} (you)` : name}</strong>
                      <span>In Office • {ago}</span>
                    </div>
                    {user.isSelf && (
                      <div className="signal-block" aria-hidden="true"><i /><i /><i /></div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── NEARBY VOICES WIDGET ── */}
            <div className="nearby-voices-widget">
              <div className="nearby-voices-header" onClick={() => setNearbyVoicesExpanded(o => !o)}>
                <div className="nearby-left">
                  <div className="nearby-wave-icon">
                    <span /><span /><span /><span />
                  </div>
                  <div>
                    <strong>Nearby Voices</strong>
                    <small>{nearbyCount} {nearbyCount === 1 ? "person" : "people"}</small>
                  </div>
                </div>
                <button className="expand-btn">{nearbyVoicesExpanded ? "▼" : "▲"}</button>
              </div>
              {nearbyVoicesExpanded && (
                <div className="nearby-voices-list">
                  {presenceUsers.filter(u => !u.isSelf).slice(0, nearbyCount).map((u, i) => (
                    <div key={i} className="nearby-voice-item">
                      <span className="nearby-dot" />
                      <span>{u.username || `Guest ${i+1}`}</span>
                    </div>
                  ))}
                  {nearbyCount === 0 && <div className="nearby-empty">No one nearby</div>}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default App;
