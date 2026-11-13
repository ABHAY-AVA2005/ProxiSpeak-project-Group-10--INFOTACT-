import { useEffect, useMemo, useRef, useState } from "react";
import brandIcon from "./assets/favicon.png";
import { JoinScreen } from "./components/JoinScreen";
import Icon from "./components/Icon";
import VirtualOffice from "./VirtualOffice";
import { useMediaStream } from "./hooks/useMediaStream";

const navItems = [
  { id: "Office", icon: "office", label: "Office" },
  { id: "Team", icon: "people", label: "Team" },
  { id: "Chat", icon: "chat", label: "Chat" },
  { id: "Meetings", icon: "calendar", label: "Meetings" },
  { id: "Settings", icon: "settings", label: "Settings" },
];

const palette = ["purple","pink","gold","mint","amber","teal","salmon","sky","lavender"];
const AVATAR_COLORS = [
  { name: "Blue", value: "#2563eb" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Orange", value: "#f97316" },
  { name: "Green", value: "#10b981" },
  { name: "Pink", value: "#ec4899" },
  { name: "Yellow", value: "#facc15" },
  { name: "Red", value: "#ef4444" },
];

const baseRooms = [
  { id: "Meeting Room", name: "Meeting Room", x: 18, y: 18, width: 285, height: 187, fill: "rgba(230,235,245,0.92)" },
  { id: "Focus Zone", name: "Focus Zone", x: 697, y: 18, width: 285, height: 187, fill: "rgba(230,235,245,0.92)" },
  { id: "Open Work", name: "Open Workspace", x: 310, y: 200, width: 380, height: 185, fill: "rgba(240,238,252,0.92)" },
  { id: "Lounge", name: "Lounge", x: 18, y: 395, width: 285, height: 190, fill: "rgba(235,230,245,0.92)" },
  { id: "Pantry", name: "Pantry", x: 697, y: 395, width: 285, height: 190, fill: "rgba(235,230,245,0.92)" },
];

const PROXIMITY_OPTIONS = [50, 75, 100, 150, 200];
const SCHEDULED_MEETINGS_KEY = "proxispeak_scheduled_meetings";
const MEETING_OWNER_KEY = "proxispeak_meeting_owner";
const THEME_MODE_KEY = "proxispeak_theme_mode";
const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";
const DEFAULT_SETTINGS = {
  autoJoinAudio: true, focusMode: false, quietHours: false,
  desktopAlerts: false, screenShare: false, doNotDisturb: false, pushToTalk: false,
};

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("proxispeak_settings") || "{}");
    const settings = saved && typeof saved === "object" && !Array.isArray(saved)
      ? Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => [
        key,
        typeof saved[key] === "boolean" ? saved[key] : defaultValue,
      ]))
      : { ...DEFAULT_SETTINGS };
    if (settings.desktopAlerts && (typeof Notification === "undefined" || Notification.permission !== "granted")) {
      settings.desktopAlerts = false;
    }
    return settings;
  } catch (settingsError) {
    console.error("[ProxiSpeak] Could not read settings:", settingsError);
    return { ...DEFAULT_SETTINGS };
  }
}

function loadAvatarColor() {
  try {
    const saved = localStorage.getItem("proxispeak_avatar_color");
    return AVATAR_COLORS.find(({ value }) => value === saved)?.value || AVATAR_COLORS[0].value;
  } catch (colorError) {
    console.error("[ProxiSpeak] Could not read avatar color:", colorError);
    return AVATAR_COLORS[0].value;
  }
}

function loadThemeMode() {
  try {
    return localStorage.getItem(THEME_MODE_KEY) === "dark" ? "dark" : "light";
  } catch (themeError) {
    console.error("[ProxiSpeak] Could not read theme preference:", themeError);
    return "light";
  }
}

function getMeetingOwnerId() {
  const existing = localStorage.getItem(MEETING_OWNER_KEY);
  if (existing) return existing;
  const cryptoApi = window.crypto;
  if (!cryptoApi?.randomUUID && !cryptoApi?.getRandomValues) throw new Error("Secure random IDs are not supported.");
  const ownerId = cryptoApi.randomUUID
    ? cryptoApi.randomUUID()
    : Array.from(cryptoApi.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(MEETING_OWNER_KEY, ownerId);
  return ownerId;
}

function getDefaultMeetingTime() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return {
    date: localDateTime.slice(0, 10),
    time: localDateTime.slice(11, 16),
  };
}

function loadScheduledMeetings() {
  const stored = localStorage.getItem(SCHEDULED_MEETINGS_KEY);
  if (!stored) return [];
  try {
    const meetings = JSON.parse(stored);
    if (!Array.isArray(meetings)) throw new TypeError("Expected a list of meetings");
    return meetings;
  } catch (error) {
    console.error("[ProxiSpeak] Could not read saved meetings:", error);
    return [];
  }
}

function SpeakingIndicator() {
  return (
    <span className="speaking-indicator" role="img" aria-label="Speaking">
      <i /><i /><i />
    </span>
  );
}

function App() {
  const [meetingOwnerId] = useState(() => {
    try {
      return getMeetingOwnerId();
    } catch (ownerIdError) {
      console.error("[ProxiSpeak] Could not create a meeting owner ID:", ownerIdError);
      return "";
    }
  });
  const [username, setUsername] = useState(() => sessionStorage.getItem("proxispeak_username") || "");
  const [roomName, setRoomName] = useState(() => {
    const storedRoom = sessionStorage.getItem("proxispeak_room")?.trim().toLowerCase();
    return baseRooms.find((room) => room.name.toLowerCase() === storedRoom)?.name.toLowerCase()
      || baseRooms[0].name.toLowerCase();
  });
  const [activeTab, setActiveTab] = useState("Office");
  const [activeRoom, setActiveRoom] = useState("Meeting Room");
  const [officeRooms] = useState(baseRooms);
  const [scheduledMeetings, setScheduledMeetings] = useState(loadScheduledMeetings);
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [meetingFormError, setMeetingFormError] = useState("");
  const [meetingEmailNotice, setMeetingEmailNotice] = useState("");
  const [meetingStorageMode, setMeetingStorageMode] = useState("");
  const [meetingsLoadError, setMeetingsLoadError] = useState(
    meetingOwnerId ? "" : "This browser could not create a meeting owner ID. Check local storage settings."
  );
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingForm, setMeetingForm] = useState(() => ({
    title: "",
    description: "",
    ...getDefaultMeetingTime(),
    duration: "60",
    participants: "",
  }));
  const [themeMode, setThemeMode] = useState(loadThemeMode);
  const [avatarColor, setAvatarColor] = useState(loadAvatarColor);
  const [searchOpen, setSearchOpen] = useState(false);
  const [presenceCollapsed, setPresenceCollapsed] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [speakingUserIds, setSpeakingUserIds] = useState([]);
  const [presenceSearch, setPresenceSearch] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [chatConnected, setChatConnected] = useState(false);
  const [chatRoomReady, setChatRoomReady] = useState(false);
  const [chatServerOutdated, setChatServerOutdated] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatScope, setChatScope] = useState("room");
  const [directChat, setDirectChat] = useState(null);
  const [earshotRadius, setEarshotRadius] = useState(100);
  const [proximityOpen, setProximityOpen] = useState(false);
  const [nearbyVoicesExpanded, setNearbyVoicesExpanded] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [officePosition, setOfficePosition] = useState({ x: 0, y: 0 });
  const [raisedHand, setRaisedHand] = useState(false);
  const [meetingActions, setMeetingActions] = useState({});
  const [announcement, setAnnouncement] = useState(null);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementError, setAnnouncementError] = useState("");
  const [peerVolumes, setPeerVolumes] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("proxispeak_peer_volumes") || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch (volumeError) {
      console.error("[ProxiSpeak] Could not read individual volume settings:", volumeError);
      return {};
    }
  });
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [recentSessions, setRecentSessions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("proxispeak_recent_sessions") || "[]");
      return Array.isArray(saved) ? saved.slice(0, 8) : [];
    } catch (sessionError) {
      console.error("[ProxiSpeak] Could not read recent sessions:", sessionError);
      return [];
    }
  });
  const [settings, setSettings] = useState(loadSettings);
  const [desktopAlertMessage, setDesktopAlertMessage] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [presenceClock, setPresenceClock] = useState(0);
  const screenShareVideoRef = useRef(null);
  const [screenShareStream, setScreenShareStream] = useState(null);
  const [remoteScreenShare, setRemoteScreenShare] = useState(null);
  const socketRef = useRef(null);
  const chatScopeRef = useRef("room");
  const directChatRef = useRef(null);
  const chatListRef = useRef(null);
  const meetingOwnerIdRef = useRef(meetingOwnerId);
  const settingsRef = useRef(settings);

  const {
    localStream, isMuted, permissionGranted, error,
    startAudio, toggleMute, speakerEnabled, speakerVolume,
    setSpeakerVolume, toggleSpeakerMute, setMuted,
  } = useMediaStream();

  useEffect(() => {
    const video = screenShareVideoRef.current;
    if (!video) return;
    const stream = screenShareStream || cameraStream || remoteScreenShare?.stream;
    if (stream) { video.srcObject = stream; video.play().catch((err) => console.warn("Screen share playback was blocked:", err)); }
    else { video.srcObject = null; }
  }, [screenShareStream, cameraStream, remoteScreenShare]);

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

  useEffect(() => {
    if (!isScheduleFormOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsScheduleFormOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isScheduleFormOpen]);

  useEffect(() => {
    let active = true;
    if (!meetingOwnerIdRef.current) {
      return () => { active = false; };
    }

    fetch(`${API_URL}/api/meetings?roomName=${encodeURIComponent(roomName)}&ownerId=${encodeURIComponent(meetingOwnerIdRef.current)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Meeting schedule could not be loaded.");
        if (!Array.isArray(result.meetings)) throw new Error("Meeting server returned an invalid schedule.");
        return result;
      })
      .then((result) => {
        if (!active) return;
        const serverIds = new Set(result.meetings.map((meeting) => meeting.id));
        const legacyMeetings = loadScheduledMeetings()
          .filter((meeting) => meeting.roomName === roomName && !serverIds.has(meeting.id))
          .map((meeting) => ({ ...meeting, localOnly: true }));
        setScheduledMeetings([...result.meetings, ...legacyMeetings].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
        setMeetingStorageMode(result.storage || "memory");
        setMeetingsLoadError("");
      })
      .catch((error) => {
        if (!active) return;
        console.error("[ProxiSpeak] Could not load meeting schedule:", error);
        setMeetingsLoadError(error.message);
      });

    return () => { active = false; };
  }, [roomName]);

  const selfStatus = settings.doNotDisturb ? "Do Not Disturb" : settings.focusMode ? "Focus" : "Available";
  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem("proxispeak_settings", JSON.stringify(settings));
    } catch (settingsError) {
      console.error("[ProxiSpeak] Could not save settings:", settingsError);
    }
  }, [settings]);
  useEffect(() => {
    try {
      localStorage.setItem(THEME_MODE_KEY, themeMode);
    } catch (themeError) {
      console.error("[ProxiSpeak] Could not save theme preference:", themeError);
    }
  }, [themeMode]);
  useEffect(() => {
    try {
      localStorage.setItem("proxispeak_avatar_color", avatarColor);
    } catch (colorError) {
      console.error("[ProxiSpeak] Could not save avatar color:", colorError);
    }
  }, [avatarColor]);
  useEffect(() => {
    try {
      localStorage.setItem("proxispeak_peer_volumes", JSON.stringify(peerVolumes));
    } catch (volumeError) {
      console.error("[ProxiSpeak] Could not save individual volume settings:", volumeError);
    }
  }, [peerVolumes]);
  useEffect(() => {
    if (chatConnected && socketRef.current?.connected) {
      socketRef.current.emit("presence:status", selfStatus);
    }
  }, [selfStatus, chatConnected]);

  const presenceUsers = useMemo(() => {
    const baseList = onlineUsers.length > 0 ? onlineUsers : [{ username, isSelf: true, status: selfStatus }];
    return baseList.map((user, index) => ({
      ...user,
      status: user.isSelf ? selfStatus : user.status || "Available",
      label: user.isSelf ? `${user.username || username} (you)` : user.username || `Guest ${index + 1}`,
      isSpeaking: speakingUserIds.includes(user.socketId),
    }));
  }, [onlineUsers, selfStatus, speakingUserIds, username]);

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
    sessionStorage.setItem("proxispeak_joined_at", new Date().toISOString());
    setUsername(cleanName);
    setRoomName(cleanRoom);
    setActiveRoom(cleanRoom);
    if (settings.autoJoinAudio && !permissionGranted) void startAudio();
  };

  const handleLeave = () => {
    const endedAt = new Date().toISOString();
    const nextSessions = [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username,
      roomName,
      startedAt: sessionStorage.getItem("proxispeak_joined_at") || endedAt,
      endedAt,
    }, ...recentSessions].slice(0, 8);
    try {
      localStorage.setItem("proxispeak_recent_sessions", JSON.stringify(nextSessions));
      setRecentSessions(nextSessions);
    } catch (sessionError) {
      console.error("[ProxiSpeak] Could not save recent session:", sessionError);
    }
    screenShareStream?.getTracks().forEach((track) => track.stop());
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
    setScreenShareStream(null);
    setRemoteScreenShare(null);
    sessionStorage.removeItem("proxispeak_joined_at");
    sessionStorage.removeItem("proxispeak_username");
    sessionStorage.removeItem("proxispeak_room");
    setUsername("");
    setRoomName(baseRooms[0].name.toLowerCase());
    setActiveRoom("Meeting Room");
    setActiveTab("Office");
  };

  const handleCreateMeeting = async (event) => {
    event.preventDefault();
    const title = meetingForm.title.trim();
    const participantEmails = meetingForm.participants
      .split(/[,\n;]/)
      .map((email) => email.trim())
      .filter(Boolean);
    const invalidEmail = participantEmails.find((email) => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email));
    if (!title) {
      setMeetingFormError("Enter a meeting title.");
      return;
    }
    if (invalidEmail) {
      setMeetingFormError(`Check this email address: ${invalidEmail}`);
      return;
    }

    const startsAt = new Date(`${meetingForm.date}T${meetingForm.time}`);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      setMeetingFormError("Choose a start time in the future.");
      return;
    }

    const meeting = {
      ownerId: meetingOwnerIdRef.current,
      title,
      description: meetingForm.description.trim(),
      startsAt: startsAt.toISOString(),
      duration: Number(meetingForm.duration),
      participantEmails,
      roomName,
    };
    try {
      setMeetingSaving(true);
      setMeetingFormError("");
      const response = await fetch(`${API_URL}/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meeting),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Meeting could not be saved.");
      const nextMeetings = [...scheduledMeetings.filter((saved) => !saved.localOnly), result.meeting]
        .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
      setScheduledMeetings(nextMeetings);
      setMeetingStorageMode(result.storage || "memory");
      setMeetingEmailNotice(
        result.invitationStatus === "not-configured"
          ? "Meeting saved, but email invitations are not configured on the server yet."
          : result.invitationStatus === "provider-error"
            ? "Meeting saved, but the email provider could not deliver invitations."
            : result.invitationStatus === "sent"
              ? "Meeting saved and email invitations sent."
              : ""
      );
      setMeetingForm({
        title: "",
        description: "",
        ...getDefaultMeetingTime(),
        duration: "60",
        participants: "",
      });
      setMeetingFormError("");
      setIsScheduleFormOpen(false);
    } catch (error) {
      console.error("[ProxiSpeak] Could not create scheduled meeting:", error);
      setMeetingFormError(error.message || "Meeting could not be saved. Check the server connection and retry.");
    } finally {
      setMeetingSaving(false);
    }
  };

  const handleDeleteMeeting = async (meeting) => {
    if (meeting.localOnly) {
      const nextLegacyMeetings = scheduledMeetings.filter((saved) => saved.id !== meeting.id);
      try {
        const remainingLegacyMeetings = loadScheduledMeetings().filter((saved) => saved.id !== meeting.id);
        localStorage.setItem(SCHEDULED_MEETINGS_KEY, JSON.stringify(remainingLegacyMeetings));
        setScheduledMeetings(nextLegacyMeetings);
      } catch (error) {
        console.error("[ProxiSpeak] Could not remove browser-only meeting:", error);
        setMeetingFormError("Could not remove this browser-only meeting.");
      }
      return;
    }
    if (!meeting.canDelete) return;
    try {
      const response = await fetch(`${API_URL}/api/meetings/${encodeURIComponent(meeting.id)}?ownerId=${encodeURIComponent(meetingOwnerIdRef.current)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Meeting could not be removed.");
      setScheduledMeetings((current) => current.filter((saved) => saved.id !== meeting.id));
    } catch (error) {
      console.error("[ProxiSpeak] Could not remove scheduled meeting:", error);
      setMeetingFormError(error.message || "Could not remove this meeting.");
    }
  };

  const handleUsersChange = (users) => {
    const nextUsers = Array.isArray(users) ? users : [];
    if (!nextUsers.length) {
      setOnlineUsers([{ username, isSelf: true, status: "In office" }]);
      return;
    }
    setOnlineUsers(nextUsers);
    const self = nextUsers.find((user) => user.isSelf);
    if (self && Number.isFinite(self.x) && Number.isFinite(self.y)) {
      const position = { x: Math.round(self.x), y: Math.round(self.y) };
      setOfficePosition((current) => current.x === position.x && current.y === position.y ? current : position);
    }
    const others = nextUsers.filter((user) => !user.isSelf && Number.isFinite(user.x) && Number.isFinite(user.y));
    setNearbyCount(self
      ? others.filter((user) => Math.hypot(user.x - self.x, user.y - self.y) <= earshotRadius).length
      : others.length);
  };

  const addNotification = (title, detail) => {
    const activeSettings = settingsRef.current;
    if (activeSettings.focusMode || activeSettings.doNotDisturb || activeSettings.quietHours) return;
    setNotifications((current) => [{ id: Date.now(), title, detail }, ...current].slice(0, 8));
    if (
      activeSettings.desktopAlerts
      && document.hidden
      && typeof Notification !== "undefined"
      && Notification.permission === "granted"
    ) {
      try {
        const desktopNotification = new Notification(title, { body: detail, icon: brandIcon });
        desktopNotification.onclick = () => window.focus();
      } catch (notificationError) {
        console.error("[ProxiSpeak] Could not show desktop notification:", notificationError);
        setDesktopAlertMessage("A desktop notification could not be displayed.");
      }
    }
  };

  const handleChatMessage = (msg) => {
    if (!msg || !msg.text) return;
    const isSelf = msg.senderId
      ? msg.senderId === socketRef.current?.id
      : msg.sender === username;
    if (msg.scope === "direct") {
      const activeTarget = directChatRef.current?.socketId;
      const otherParticipant = isSelf ? msg.recipientId : msg.senderId;
      if (!activeTarget || activeTarget !== otherParticipant) return;
    } else if (directChatRef.current) {
      return;
    }
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

  const handleSelectChatScope = (nextScope) => {
    if (nextScope === chatScopeRef.current && !directChatRef.current) return;
    directChatRef.current = null;
    setDirectChat(null);
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

  const handleOpenDirectChat = (user) => {
    if (!user.socketId || user.isSelf) return;
    const conversation = { socketId: user.socketId, username: user.username || "Teammate" };
    directChatRef.current = conversation;
    setDirectChat(conversation);
    setChatError("");
    setChatMessages([]);
    setActiveTab("Chat");

    const socket = socketRef.current;
    if (!socket?.connected) {
      setChatError("Chat is reconnecting. Please try again when you are back online.");
      return;
    }
    socket.timeout(5000).emit(
      "chat:direct:history",
      { targetId: conversation.socketId },
      (error, response) => {
        if (error || !response?.ok) {
          if (directChatRef.current?.socketId === conversation.socketId) {
            setChatError("This teammate is no longer available for a direct message.");
          }
          return;
        }
        if (directChatRef.current?.socketId !== conversation.socketId) return;
        setChatMessages(response.messages.map((message) => ({
          id: message.id,
          isSelf: message.senderId === socket.id,
          scope: "direct",
          sender: message.senderId === socket.id ? "You" : message.sender,
          text: message.text,
          time: message.time
            ? new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "Now",
        })));
      }
    );
  };

  const handleReturnToGroupChat = () => {
    directChatRef.current = null;
    setDirectChat(null);
    setChatMessages([]);
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.timeout(5000).emit("chat:history", { scope: chatScopeRef.current }, (error, response) => {
      if (error || !response?.ok) {
        setChatError("Could not load this chat history. Please try again.");
        return;
      }
      setChatMessages(response.messages.map((message) => ({
        id: message.id,
        isSelf: message.senderId === socket.id,
        scope: chatScopeRef.current,
        sender: message.senderId === socket.id ? "You" : message.sender,
        text: message.text,
        time: message.time
          ? new Date(message.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Now",
      })));
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
    const directTarget = directChatRef.current;
    socketRef.current.timeout(5000).emit(
      directTarget ? "chat:direct:message" : "chat:message",
      directTarget
        ? { text: trimmed, targetId: directTarget.socketId }
        : { text: trimmed, scope: chatScopeRef.current },
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

  const sendMeetingAction = (action, value) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("meeting:action", { action, value });
  };

  const handleRaiseHand = () => {
    const next = !raisedHand;
    setRaisedHand(next);
    sendMeetingAction("hand", next);
  };

  const handleReaction = (emoji) => {
    sendMeetingAction("reaction", emoji);
  };

  const handleAnnouncement = (event) => {
    event.preventDefault();
    const text = announcementDraft.trim();
    if (!text || !socketRef.current?.connected) {
      setAnnouncementError("Reconnect to the office before sending an announcement.");
      return;
    }
    socketRef.current.emit("office:announcement", { text }, (response) => {
      if (!response?.ok) {
        setAnnouncementError(response?.error || "Announcement could not be sent.");
        return;
      }
      setAnnouncementDraft("");
      setAnnouncementError("");
      setAnnouncementOpen(false);
    });
  };

  const handleToggleCamera = async () => {
    setCameraError("");
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setCameraStream((current) => current === stream ? null : current);
      }, { once: true });
      setCameraStream(stream);
    } catch (cameraAccessError) {
      setCameraError(cameraAccessError.message || "Camera access was denied.");
    }
  };

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;
    const onMeetingAction = ({ socketId, action, value, username: actor } = {}) => {
      if (!socketId) return;
      setMeetingActions((current) => ({ ...current, [socketId]: { action, value, username: actor } }));
      if (action === "reaction") {
        window.setTimeout(() => {
          setMeetingActions((current) => {
            if (current[socketId]?.value !== value) return current;
            const next = { ...current };
            delete next[socketId];
            return next;
          });
        }, 2500);
      }
    };
    const onAnnouncement = (message) => {
      setAnnouncement(message);
      addNotification("Office announcement", message.text);
      window.setTimeout(() => setAnnouncement((current) => current?.id === message.id ? null : current), 12_000);
    };
    socket.on("meeting:action", onMeetingAction);
    socket.on("office:announcement", onAnnouncement);
    return () => {
      socket.off("meeting:action", onMeetingAction);
      socket.off("office:announcement", onAnnouncement);
    };
  }, [chatConnected]);

  useEffect(() => {
    if (!settings.pushToTalk || !permissionGranted) return undefined;
    setMuted(true);
    const releaseOnBlur = () => setMuted(true);
    const press = (event) => {
      const target = event.target;
      if (
        event.code !== "Space"
        || event.repeat
        || target?.isContentEditable
        || target?.closest?.("input, textarea, select, button, [contenteditable='true']")
      ) return;
      event.preventDefault();
      setMuted(false);
    };
    const release = (event) => {
      if (event.code === "Space") setMuted(true);
    };
    window.addEventListener("keydown", press);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", releaseOnBlur);
    return () => {
      window.removeEventListener("keydown", press);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", releaseOnBlur);
      setMuted(true);
    };
  }, [settings.pushToTalk, permissionGranted, setMuted]);

  const handleRemoteScreenShareChange = (share) => {
    setRemoteScreenShare((current) => {
      if (!share?.stream) return current?.socketId === share?.socketId ? null : current;
      return share;
    });
  };

  const handleToggleSetting = async (key) => {
    if (key === "desktopAlerts" && !settings.desktopAlerts) {
      if (typeof Notification === "undefined") {
        setDesktopAlertMessage("Desktop notifications are not supported in this browser.");
        return;
      }
      if (Notification.permission === "denied") {
        setDesktopAlertMessage("Notifications are blocked by your browser. Allow them in site settings, then try again.");
        return;
      }
      if (Notification.permission !== "granted") {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setDesktopAlertMessage("Notification permission was not granted.");
            return;
          }
        } catch (permissionError) {
          console.error("[ProxiSpeak] Could not request notification permission:", permissionError);
          setDesktopAlertMessage("Could not request notification permission.");
          return;
        }
      }
    }
    setDesktopAlertMessage("");
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  const timeAgo = (user) => {
    if (user.isSelf) return "Near You";
    if (!Number.isFinite(user.joinedAt)) return "Online";
    const minutes = Math.max(0, Math.floor((presenceClock - user.joinedAt) / 60_000));
    return minutes === 0 ? "Just now" : `${minutes}m ago`;
  };
  const desktopAlertStatus = desktopAlertMessage
    || (typeof Notification === "undefined"
      ? "Desktop notifications are not supported in this browser."
      : Notification.permission === "granted"
        ? settings.desktopAlerts ? "Browser permission is enabled." : "Browser permission is ready; turn this on to receive alerts."
        : Notification.permission === "denied"
          ? "Notifications are blocked in browser site settings."
          : "Turning this on will ask your browser for permission.");

  if (!username) return <JoinScreen onJoin={handleJoin} rooms={officeRooms} themeMode={themeMode} />;

  return (
    <div className={`proxi-app-shell theme-${themeMode} ${activeTab === "Office" ? "office-layout" : ""}`}>
      <header className="app-navigation">
        <div className="brand-block">
          <img className="brand-signal" src={brandIcon} alt="" />
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
              <span className="nav-icon"><Icon name={item.icon} size={17} /></span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="navigation-presence">
          <span className="online-dot" />
          <div>
            <strong>You&apos;re Online</strong>
            <small>In Office • Floor 2</small>
          </div>
        </div>
        <div className="navigation-actions">
          <div className="header-right">
            <button
              type="button"
              className="hdr-icon-btn theme-toggle-btn"
              aria-label={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
              aria-pressed={themeMode === "dark"}
              title={`Switch to ${themeMode === "dark" ? "light" : "dark"} mode`}
              onClick={() => setThemeMode((current) => current === "dark" ? "light" : "dark")}
            >
              <Icon name={themeMode === "dark" ? "sun" : "moon"} size={19} />
            </button>
            <button
              className={`hdr-icon-btn ${searchOpen ? "active" : ""}`}
              aria-label="Search"
              onClick={() => setSearchOpen(o => !o)}
              title="Search teammates"
            >
              <Icon name="search" />
            </button>
            <button className="hdr-icon-btn notif-btn" aria-label="Notifications" aria-expanded={notificationOpen} onClick={() => { setNotificationOpen(o => !o); setProfileOpen(false); }}>
              <Icon name="bell" />
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
        </div>
        <button
          type="button"
          className={`nav-quick-mic ${isMuted ? "muted" : ""}`}
          onClick={permissionGranted ? toggleMute : startAudio}
          aria-label={permissionGranted ? (isMuted ? "Unmute microphone" : "Mute microphone") : "Enable microphone"}
          title={permissionGranted ? (isMuted ? "Unmute microphone" : "Mute microphone") : "Enable microphone"}
        >
          {permissionGranted ? (isMuted ? "Mic off" : "Mic on") : "Enable mic"}
        </button>
      </header>

      {/* ── MAIN CONTENT WRAPPER ── */}
      <div className="main-content">
        <section className="office-summary-bar" aria-label="Office status">
          <div className="office-summary-position" aria-live="polite">
            <span>⌖</span> {officePosition.x}, {officePosition.y}
          </div>
          <button type="button" className="secondary-button" onClick={() => { setAnnouncementError(""); setAnnouncementOpen(true); }}>
            Announce to floor
          </button>
        </section>
        {announcement && (
          <div className="office-announcement-banner" role="status">
            <strong>📢 {announcement.username}:</strong> {announcement.text}
            <button type="button" aria-label="Dismiss announcement" onClick={() => setAnnouncement(null)}>×</button>
          </div>
        )}
        {announcementOpen && (
          <form className="announcement-form" onSubmit={handleAnnouncement}>
            <label htmlFor="announcement-text">Floor announcement</label>
            <input id="announcement-text" autoFocus maxLength={240} value={announcementDraft} onChange={(event) => setAnnouncementDraft(event.target.value)} placeholder="Share an update with everyone in this room" required />
            <button type="submit" className="primary-button" disabled={!chatConnected || !announcementDraft.trim()}>Send</button>
            <button type="button" className="secondary-button" onClick={() => setAnnouncementOpen(false)}>Cancel</button>
            {announcementError && <p role="alert" className="meeting-form-error">{announcementError}</p>}
          </form>
        )}

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
                  onSpeakingUsersChange={setSpeakingUserIds}
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
                  onPositionChange={(position) => setOfficePosition(position)}
                  meetingActions={meetingActions}
                  peerVolumes={peerVolumes}
                  speakerEnabled={speakerEnabled}
                  speakerVolume={speakerVolume}
                  cameraStream={cameraStream}
                  meetingRooms={officeRooms}
                  spawnRoom={activeRoom}
                  avatarColor={avatarColor}
                  themeMode={themeMode}
                />
              </div>

              {(screenShareStream || cameraStream || remoteScreenShare?.stream) && (
                <div className="office-video-preview">
                  <strong>{screenShareStream ? "Your screen" : cameraStream ? "Your camera" : `${remoteScreenShare?.username || "Teammate"}'s video`}</strong>
                  <video
                    ref={(video) => {
                      screenShareVideoRef.current = video;
                      const stream = screenShareStream || cameraStream || remoteScreenShare?.stream;
                      if (video && stream && video.srcObject !== stream) {
                        video.srcObject = stream;
                        video.play().catch((err) => console.warn("Video playback was blocked:", err));
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="screen-share-video"
                  />
                </div>
              )}

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
                              {user.isSpeaking && <SpeakingIndicator />}
                              {meetingActions[user.socketId]?.action === "hand" && meetingActions[user.socketId]?.value && (
                                <span className="meeting-action-pill" aria-label="Hand raised">✋</span>
                              )}
                              {meetingActions[user.socketId]?.action === "reaction" && (
                                <span className="meeting-action-pill" aria-label={`Reaction ${meetingActions[user.socketId].value}`}>{meetingActions[user.socketId].value}</span>
                              )}
                              {!user.isSelf && (
                                <div className="team-row-actions">
                                  <button type="button" className="secondary-button" onClick={() => handleOpenDirectChat(user)}>Message</button>
                                  <label className="peer-volume-control">
                                    <span>Volume {peerVolumes[user.socketId] ?? 100}%</span>
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={peerVolumes[user.socketId] ?? 100}
                                      aria-label={`Volume for ${name}`}
                                      onChange={(event) => setPeerVolumes((current) => ({ ...current, [user.socketId]: Number(event.target.value) }))}
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {activeTab === "Team" && (
                    <div className="workspace-card">
                      <div className="card-header-row"><h2>Recent sessions</h2><span>This browser</span></div>
                      {recentSessions.length === 0 ? (
                        <div className="meeting-empty"><strong>No previous office sessions</strong><span>Your completed sessions will appear here.</span></div>
                      ) : (
                        <div className="meeting-list">
                          {recentSessions.map((session) => (
                            <div className="meeting-item" key={session.id}>
                              <div>
                                <strong>{session.roomName}</strong>
                                <small>{new Date(session.startedAt).toLocaleString()} · {Math.max(1, Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60_000))} min</small>
                              </div>
                              <button type="button" className="primary-button" onClick={() => handleJoin(session.username, session.roomName)}>Rejoin</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === "Chat" && (
                    <div className="workspace-card chat-card">
                      <div className="card-header-row">
                        <div>
                          <h2>{directChat ? `Chat with ${directChat.username}` : "Workspace chat"}</h2>
                          <small>
                            {directChat
                              ? "Direct message"
                              : chatScope === "all" ? "Everyone in the meeting" : `Room: ${roomName}`}
                          </small>
                        </div>
                        <div className="chat-header-actions">
                          <span>
                            {!chatConnected
                              ? "Offline"
                              : chatServerOutdated
                                ? "Server update needed"
                                : chatRoomReady
                                  ? "Live"
                                  : "Joining room..."}
                          </span>
                          {directChat ? (
                            <button type="button" className="secondary-button" onClick={handleReturnToGroupChat}>
                              Back to group chat
                            </button>
                          ) : (
                            <>
                              <div className="chat-scope-toggle" role="group" aria-label="Chat audience">
                                <button
                                  type="button"
                                  className={chatScope === "room" ? "selected" : ""}
                                  aria-pressed={chatScope === "room"}
                                  onClick={() => handleSelectChatScope("room")}
                                >
                                  Room chat
                                </button>
                                <button
                                  type="button"
                                  className={chatScope === "all" ? "selected" : ""}
                                  aria-pressed={chatScope === "all"}
                                  onClick={() => handleSelectChatScope("all")}
                                >
                                  All chat
                                </button>
                              </div>
                              <button type="button" className="primary-button" onClick={handleToggleScreenShare}>
                                {screenShareStream ? "Stop sharing" : "Share screen"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="chat-list" ref={chatListRef}>
                        {chatMessages.length === 0 ? (
                          <div className="chat-empty-state">
                            <span className="chat-empty-icon" aria-hidden="true">✦</span>
                            <strong>No messages yet</strong>
                            <span>Start the conversation with your office.</span>
                          </div>
                        ) : chatMessages.map(m => (
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
                    <div className="meetings-page">
                      <section className="workspace-card">
                        <div className="card-header-row">
                          <div>
                            <h2>Meetings</h2>
                            <small className="meetings-subtitle">Shared office schedule{meetingStorageMode === "memory" ? " · server memory storage" : meetingStorageMode === "mongodb" ? " · MongoDB synced" : ""}</small>
                          </div>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => {
                              setMeetingFormError("");
                              setIsScheduleFormOpen(true);
                            }}
                          >
                            + Schedule a meeting
                          </button>
                        </div>
                        {meetingsLoadError && <p role="status" className="meeting-form-error">{meetingsLoadError}</p>}
                        {meetingEmailNotice && <p role="status" className="meeting-email-notice">{meetingEmailNotice}</p>}
                        <div className="meeting-list">
                          {scheduledMeetings.length === 0 ? (
                            <div className="meeting-empty">
                              <span className="meeting-empty-icon" aria-hidden="true"><Icon name="calendar" size={22} /></span>
                              <strong>No meetings scheduled yet</strong>
                              <span>Schedule a meeting to share it with your office.</span>
                            </div>
                          ) : scheduledMeetings.map((meeting) => (
                            <article className="scheduled-meeting" key={meeting.id}>
                              <div className="scheduled-meeting-date">
                                <strong>{new Date(meeting.startsAt).toLocaleDateString([], { month: "short", day: "numeric" })}</strong>
                                <span>{new Date(meeting.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                              </div>
                              <div className="scheduled-meeting-info">
                                <strong>{meeting.title}</strong>
                                <span>
                                  {new Date(meeting.startsAt).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                                  {" · "}{meeting.duration} min · {meeting.roomName}
                                </span>
                                {meeting.description && <p>{meeting.description}</p>}
                                {meeting.participantEmails.length > 0 && (
                                  <small>{meeting.participantEmails.length} participant email{meeting.participantEmails.length === 1 ? "" : "s"} added</small>
                                )}
                                {meeting.localOnly && <small className="meeting-local-warning">Saved only in this browser</small>}
                              </div>
                              {(meeting.canDelete || meeting.localOnly) && (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  aria-label={`Remove ${meeting.title}`}
                                  onClick={() => handleDeleteMeeting(meeting)}
                                >
                                  Remove
                                </button>
                              )}
                            </article>
                          ))}
                        </div>
                        {meetingFormError && !isScheduleFormOpen && <p role="status" className="meeting-form-error">{meetingFormError}</p>}
                      </section>

                      <section className="workspace-card">
                        <div className="card-header-row"><h2>Office rooms</h2><span>Join a space</span></div>
                        <div className="meeting-list">
                          {officeRooms.map((r) => (
                            <div className="meeting-item" key={r.id}>
                              <div><strong>{r.name}</strong><small>{r.name === activeRoom ? "Active" : "Available"}</small></div>
                              <button type="button" className="primary-button" onClick={() => { setActiveRoom(r.name); setActiveTab("Office"); }}>
                                {r.name === activeRoom ? "Selected" : "Open"}
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>

                      {isScheduleFormOpen && (
                        <div
                          className="meeting-dialog-backdrop"
                          onMouseDown={(event) => {
                            if (event.target === event.currentTarget) setIsScheduleFormOpen(false);
                          }}
                        >
                          <section
                            className="meeting-dialog"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="schedule-meeting-title"
                          >
                            <div className="meeting-dialog-header">
                              <div>
                                <h2 id="schedule-meeting-title">Schedule a new meeting</h2>
                                <p>Set a time and add participants for your virtual office meeting.</p>
                              </div>
                              <button type="button" className="meeting-dialog-close" aria-label="Close" onClick={() => setIsScheduleFormOpen(false)}><Icon name="close" size={18} /></button>
                            </div>
                            <form className="meeting-form" onSubmit={handleCreateMeeting}>
                              <label>
                                <span>Meeting title</span>
                                <input
                                  autoFocus
                                  required
                                  maxLength={100}
                                  value={meetingForm.title}
                                  onChange={(event) => setMeetingForm({ ...meetingForm, title: event.target.value })}
                                  placeholder="e.g. Project discussion"
                                />
                              </label>
                              <label>
                                <span>Description</span>
                                <textarea
                                  rows={3}
                                  maxLength={1000}
                                  value={meetingForm.description}
                                  onChange={(event) => setMeetingForm({ ...meetingForm, description: event.target.value })}
                                  placeholder="What would you like to discuss?"
                                />
                              </label>
                              <div className="meeting-form-grid">
                                <label>
                                  <span>Date</span>
                                  <input
                                    type="date"
                                    min={getDefaultMeetingTime().date}
                                    required
                                    value={meetingForm.date}
                                    onChange={(event) => setMeetingForm({ ...meetingForm, date: event.target.value })}
                                  />
                                </label>
                                <label>
                                  <span>Start time</span>
                                  <input
                                    type="time"
                                    required
                                    value={meetingForm.time}
                                    onChange={(event) => setMeetingForm({ ...meetingForm, time: event.target.value })}
                                  />
                                </label>
                                <label>
                                  <span>Duration</span>
                                  <select value={meetingForm.duration} onChange={(event) => setMeetingForm({ ...meetingForm, duration: event.target.value })}>
                                    <option value="30">30 minutes</option>
                                    <option value="60">1 hour</option>
                                    <option value="90">1 hour 30 minutes</option>
                                    <option value="120">2 hours</option>
                                  </select>
                                </label>
                              </div>
                              <label>
                                <span>Participant email addresses</span>
                                <textarea
                                  rows={2}
                                  value={meetingForm.participants}
                                  onChange={(event) => setMeetingForm({ ...meetingForm, participants: event.target.value })}
                                  placeholder="name@example.com, teammate@example.com"
                                />
                                <small>Separate addresses with commas or new lines. Delivery requires RESEND_API_KEY and EMAIL_FROM on the server.</small>
                              </label>
                              <div className="meeting-location">
                                <Icon name="mapPin" size={18} />
                                <div><strong>Meeting location: ProxiSpeak Virtual Office</strong><small>Participants can join through your existing office.</small></div>
                              </div>
                              {meetingFormError && <p role="alert" className="meeting-form-error">{meetingFormError}</p>}
                              <div className="meeting-form-actions">
                                <button type="button" className="secondary-button" onClick={() => setIsScheduleFormOpen(false)}>Cancel</button>
                                <button type="submit" className="primary-button" disabled={meetingSaving}>{meetingSaving ? "Saving..." : "Create meeting"}</button>
                              </div>
                            </form>
                          </section>
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === "Settings" && (
                    <div className="workspace-card">
                      <div className="card-header-row"><h2>Settings</h2><span>Preferences</span></div>
                      <div className="setting-list">
                        <div className="setting-row theme-setting-row">
                          <div className="theme-setting-copy">
                            <span>Appearance</span>
                            <small>Choose light or dark mode</small>
                          </div>
                          <div className="theme-mode-switch" role="group" aria-label="Appearance">
                            <button
                              type="button"
                              className={themeMode === "light" ? "selected" : ""}
                              aria-pressed={themeMode === "light"}
                              onClick={() => setThemeMode("light")}
                            >
                              <Icon name="sun" size={16} />
                              Light
                            </button>
                            <button
                              type="button"
                              className={themeMode === "dark" ? "selected" : ""}
                              aria-pressed={themeMode === "dark"}
                              onClick={() => setThemeMode("dark")}
                            >
                              <Icon name="moon" size={16} />
                              Dark
                            </button>
                          </div>
                        </div>
                        {[["autoJoinAudio","Auto-join audio"],["focusMode","Focus mode"],["quietHours","Quiet hours"],["desktopAlerts","Desktop alerts"],["doNotDisturb","Do not disturb"]].map(([key, label]) => (
                          <label key={key} className="setting-row">
                            <span>{label}</span>
                            <input type="checkbox" checked={settings[key]} onChange={() => handleToggleSetting(key)} />
                          </label>
                        ))}
                        <small className="settings-help">
                          Auto-join requests microphone access when you enter. Focus mode, Quiet hours, and Do not disturb silence new alerts.
                        </small>
                        <small className="settings-help" aria-live="polite">{desktopAlertStatus}</small>
                        <label className="setting-row">
                          <span>Push to talk (hold Space)</span>
                          <input type="checkbox" checked={settings.pushToTalk} onChange={() => handleToggleSetting("pushToTalk")} />
                        </label>
                        <label className="setting-row audio-volume-row">
                          <span>Speaker volume ({speakerVolume}%)</span>
                          <input type="range" min="0" max="100" value={speakerVolume} onChange={(event) => setSpeakerVolume(Number(event.target.value))} />
                        </label>
                        <div className="setting-row avatar-row">
                          <span>Avatar colour</span>
                          <div className="avatar-colour-picker">
                            {AVATAR_COLORS.map(({ name, value }) => (
                              <button
                                key={value}
                                type="button"
                                className={`avatar-color-swatch ${avatarColor === value ? "selected" : ""}`}
                                style={{ background: value }}
                                onClick={() => setAvatarColor(value)}
                                aria-label={`Set avatar colour to ${name}`}
                                aria-pressed={avatarColor === value}
                                title={name}
                              />
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
                type="button"
                className={`voice-btn mic-btn ${isMuted ? "muted" : "active"}`}
                onClick={permissionGranted ? toggleMute : startAudio}
                title={!permissionGranted ? "Enable microphone" : isMuted ? "Unmute microphone" : "Mute microphone"}
                aria-label={!permissionGranted ? "Enable microphone" : isMuted ? "Unmute microphone" : "Mute microphone"}
              >
                <Icon name={isMuted ? "micOff" : "mic"} size={18} />
              </button>

              <button
                type="button"
                className={`voice-btn camera-btn ${cameraStream ? "active" : ""}`}
                onClick={handleToggleCamera}
                title={cameraStream ? "Turn camera off" : "Turn camera on"}
                aria-label={cameraStream ? "Turn camera off" : "Turn camera on"}
              >
                <Icon name={cameraStream ? "video" : "videoOff"} size={18} />
              </button>
              <button
                type="button"
                className={`voice-btn camera-btn ${screenShareStream ? "active" : ""}`}
                onClick={handleToggleScreenShare}
                title={screenShareStream ? "Stop screen sharing" : "Share screen"}
                aria-label={screenShareStream ? "Stop screen sharing" : "Share screen"}
              >
                <Icon name="screenShare" size={18} />
              </button>
              <button
                type="button"
                className={`voice-btn hand-btn ${raisedHand ? "active" : ""}`}
                onClick={handleRaiseHand}
                title={raisedHand ? "Lower hand" : "Raise hand"}
                aria-pressed={raisedHand}
              >
                <Icon name="hand" size={18} />
              </button>
              <div className="reaction-picker" role="group" aria-label="Send a reaction">
                {["👏", "❤️", "👍"].map((emoji) => (
                  <button type="button" key={emoji} className="voice-btn reaction-button" onClick={() => handleReaction(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>
                ))}
              </div>
              <label className="push-to-talk-toggle">
                <input type="checkbox" checked={settings.pushToTalk} onChange={() => handleToggleSetting("pushToTalk")} />
                <span>Push to talk (Space)</span>
              </label>
              <button
                className={`voice-btn speaker-btn ${!speakerEnabled ? "muted" : ""}`}
                onClick={toggleSpeakerMute}
                title="Toggle speaker"
                aria-label={speakerEnabled ? "Mute speakers" : "Enable speakers"}
              >
                <Icon name={speakerEnabled ? "volume" : "volumeOff"} size={18} />
              </button>

              <div className="proximity-wrapper">
                <button
                  className="proximity-selector-btn"
                  onClick={() => setProximityOpen(o => !o)}
                  aria-expanded={proximityOpen}
                  aria-haspopup="menu"
                >
                  <span className="prox-dot" />
                  Proximity: {earshotRadius}px <Icon name="chevronDown" size={15} />
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

              <button type="button" className="voice-btn settings-btn" title="Audio settings" aria-label="Open settings" onClick={() => setActiveTab("Settings")}>
                <Icon name="settings" size={18} />
              </button>

              <button type="button" className="voice-btn end-btn" onClick={handleLeave} title="Leave office" aria-label="Leave office">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.65 1.87-.18.18-.42.28-.68.28-.28 0-.52-.11-.71-.29L.29 12.88a.996.996 0 0 1 0-1.41C3.34 8.44 7.46 6.5 12 6.5s8.66 1.94 11.71 4.97c.39.39.39 1.02 0 1.41l-2.5 2.5a.996.996 0 0 1-.71.29c-.26 0-.5-.1-.68-.28a11.8 11.8 0 0 0-2.65-1.87.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9Z" />
                </svg>
              </button>
            </div>
            {cameraError && <p className="media-control-error" role="status">{cameraError}</p>}
            {error && <p className="media-control-error" role="status">Microphone: {error}</p>}
          </section>

          {/* ── LEFT PRESENCE PANEL ── */}
          <aside className={`presence-panel ${presenceCollapsed ? "is-collapsed" : ""}`}>
            <div className="presence-status-badges" role="group" aria-label="Workspace status">
              <div className="team-selector-btn">
                <span className="team-dot" /><span>ProxiSpeak HQ</span><span className="caret-icon">· Floor 2</span>
              </div>
              <div className="online-count-btn">
                <span className="users-icon"><Icon name="people" size={16} /></span><span>{presenceUsers.length} Online</span>
              </div>
            </div>
            <div className="presence-head">
              <div className="presence-users-heading">
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
                <Icon name="search" size={16} />
              </button>
              <button
                type="button"
                className="presence-collapse-toggle"
                onClick={() => setPresenceCollapsed((collapsed) => !collapsed)}
                aria-label={presenceCollapsed ? "Expand online users panel" : "Collapse online users panel"}
                aria-pressed={presenceCollapsed}
                title={presenceCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Icon name={presenceCollapsed ? "chevronRight" : "chevronLeft"} size={16} />
              </button>
            </div>

            {searchOpen && (
              <div className="presence-search">
                <span><Icon name="search" size={15} /></span>
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
                      <span>{user.status} • {ago}</span>
                      {!user.isSelf && (
                        <label className="peer-volume-control">
                          <span>{peerVolumes[user.socketId] ?? 100}% volume</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={peerVolumes[user.socketId] ?? 100}
                            aria-label={`Volume for ${name}`}
                            onChange={(event) => setPeerVolumes((current) => ({ ...current, [user.socketId]: Number(event.target.value) }))}
                          />
                        </label>
                      )}
                    </div>
                    {meetingActions[user.socketId]?.action === "hand" && meetingActions[user.socketId]?.value && <span className="meeting-action-pill" aria-label="Hand raised">✋</span>}
                    {meetingActions[user.socketId]?.action === "reaction" && <span className="meeting-action-pill" aria-label={`Reaction ${meetingActions[user.socketId].value}`}>{meetingActions[user.socketId].value}</span>}
                    {user.isSpeaking && <SpeakingIndicator />}
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
                      {u.isSpeaking && <SpeakingIndicator />}
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
