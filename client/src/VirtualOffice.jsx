import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { findPath } from "./officePathfinding.js";

const serverPort = new URLSearchParams(window.location.search).get("server");

const SERVER_URL =
  serverPort === "5001"
    ? "http://localhost:5001"
    : import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

// ─── World constants (match server WORLD_BOUNDS) ─────────────────────────────
const WORLD_W = 1000;
const WORLD_H = 600;
const GRID_SIZE = 20;
const PATH_GRID_SIZE = 10;
const AVATAR_RADIUS = 18;
const PATH_SAMPLE_SPACING = 3;
const OPEN_WORKSPACE_BASE = { x: 312, y: 195, width: 376, height: 190 };
const OPEN_WORKSPACE_INSET = OPEN_WORKSPACE_BASE.width * 0.15;
const OPEN_WORKSPACE = {
  ...OPEN_WORKSPACE_BASE,
  x: OPEN_WORKSPACE_BASE.x + OPEN_WORKSPACE_INSET,
  width: OPEN_WORKSPACE_BASE.width - OPEN_WORKSPACE_INSET * 2,
};
const OPEN_WORKSPACE_DESK_WIDTH = 85;
const OPEN_WORKSPACE_DESKS = [0, 1, 2].flatMap((column) => {
  const x = OPEN_WORKSPACE.x + column * (
    OPEN_WORKSPACE_DESK_WIDTH +
    (OPEN_WORKSPACE.width - OPEN_WORKSPACE_DESK_WIDTH * 3) / 2
  );
  return [{ x, y: 220 }, { x, y: 315 }];
});

// ─── Wall / obstacle definitions ─────────────────────────────────────────────
// Rectangles use x/y as their top-left; circles use x/y as their center.
const buildRoomBoundary = (room, doorSide, doorStart = 0, doorWidth = 100) => {
  const { x, y, width, height } = room;
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;
  const wallThickness = 6;

  const walls = [];
  const addWall = (wallX, wallY, wallW, wallH) => {
    walls.push({ x: wallX, y: wallY, width: wallW, height: wallH, label: null });
  };

  // Top / bottom / left / right walls with specific doorway opening
  if (doorSide !== "top") addWall(left, top, width, wallThickness);
  if (doorSide !== "bottom") addWall(left, bottom - wallThickness, width, wallThickness);
  if (doorSide !== "left") addWall(left, top, wallThickness, height);
  if (doorSide !== "right") addWall(right - wallThickness, top, wallThickness, height);

  if (doorSide === "right") {
    // Leave a gap from doorStart to doorStart + doorWidth along right wall
    const dStart = doorStart || (top + height / 2 - doorWidth / 2);
    const topSeg = Math.max(0, dStart - top);
    const botSeg = Math.max(0, bottom - (dStart + doorWidth));
    if (topSeg > 0) addWall(right - wallThickness, top, wallThickness, topSeg);
    if (botSeg > 0) addWall(right - wallThickness, dStart + doorWidth, wallThickness, botSeg);
  }

  if (doorSide === "left") {
    const dStart = doorStart || (top + height / 2 - doorWidth / 2);
    const topSeg = Math.max(0, dStart - top);
    const botSeg = Math.max(0, bottom - (dStart + doorWidth));
    if (topSeg > 0) addWall(left, top, wallThickness, topSeg);
    if (botSeg > 0) addWall(left, dStart + doorWidth, wallThickness, botSeg);
  }

  return walls;
};

const ROOM_BOUNDARIES = [
  // Meeting Room (top-left: x 18..303, y 18..205) -> doorway on right wall at y: 65..165 (gap: 100px)
  ...buildRoomBoundary({ x: 18, y: 18, width: 285, height: 187 }, "right", 65, 100),
  // Focus Zone (top-right: x 697..982, y 18..205) -> doorway on left wall at y: 65..165 (gap: 100px)
  ...buildRoomBoundary({ x: 697, y: 18, width: 285, height: 187 }, "left", 65, 100),
  // Lounge (bottom-left: x 18..303, y 395..585) -> doorway on right wall at y: 420..525 (gap: 105px)
  ...buildRoomBoundary({ x: 18, y: 395, width: 285, height: 190 }, "right", 420, 105),
  // Pantry (bottom-right: x 697..982, y 395..585) -> doorway on left wall at y: 420..525 (gap: 105px)
  ...buildRoomBoundary({ x: 697, y: 395, width: 285, height: 190 }, "left", 420, 105),
];

// Collision bounds follow the visible furniture; circles use x/y as their center.
const OBSTACLES = [
  { x: 52, y: 68, width: 205, height: 68, label: "Meeting table" },
  ...[0, 1, 2, 3].flatMap((chair) => [
    { x: 64 + chair * 48, y: 54, width: 28, height: 12, label: "Chair" },
    { x: 64 + chair * 48, y: 138, width: 28, height: 12, label: "Chair" },
  ]),
  { x: 34, y: 95, width: 12, height: 28, label: "Chair" },
  { x: 230, y: 95, width: 12, height: 28, label: "Chair" },
  { x: 40, y: 172, radius: 19, label: "Plant" },
  ...[0, 1, 2].map((desk) => ({
    x: 712 + desk * 86, y: 48, width: 70, height: 65, label: "Focus desk",
  })),
  ...OPEN_WORKSPACE_DESKS.map(({ x, y }) => ({
    x, y, width: OPEN_WORKSPACE_DESK_WIDTH, height: 66, label: "Desk",
  })),
  { x: 42, y: 440, width: 115, height: 55, label: "Sofa" },
  { x: 52, y: 508, width: 95, height: 38, label: "Coffee table" },
  { x: 702, y: 396, width: 268, height: 62, label: "Pantry counter" },
  { x: 940, y: 535, radius: 19, label: "Plant" },
];

function mapAxisCoordinate(value, renderedSize, baseSize, middleStart, middleEnd) {
  const extraSpace = Math.max(0, renderedSize - baseSize);
  if (value <= middleStart) return value;
  if (value < middleEnd) {
    const expandedScale = 1 + extraSpace / (middleEnd - middleStart);
    return middleStart + (value - middleStart) * expandedScale;
  }
  return value + extraSpace;
}

function unmapAxisCoordinate(value, renderedSize, baseSize, middleStart, middleEnd) {
  const extraSpace = Math.max(0, renderedSize - baseSize);
  const expandedMiddleEnd = middleEnd + extraSpace;
  if (value <= middleStart) return value;
  if (value < expandedMiddleEnd) {
    const expandedScale = 1 + extraSpace / (middleEnd - middleStart);
    return middleStart + (value - middleStart) / expandedScale;
  }
  return value - extraSpace;
}

function createRenderLayout(cssWidth, cssHeight, dpr = 1) {
  const safeWidth = Math.max(1, cssWidth);
  const safeHeight = Math.max(1, cssHeight);
  const scale = Math.min(safeWidth / WORLD_W, safeHeight / WORLD_H);
  const width = safeWidth / scale;
  const height = safeHeight / scale;
  const layout = { width, height, scale, dpr, cssWidth: safeWidth, cssHeight: safeHeight };
  const mapX = (x) => mapAxisCoordinate(x, width, WORLD_W, 303, 697);
  const mapY = (y) => mapAxisCoordinate(y, height, WORLD_H, 205, 395);
  const outerWalls = [
    { x: 10, y: 10, width: width - 20, height: 6 },
    { x: 10, y: height - 16, width: width - 20, height: 6 },
    { x: 10, y: 10, width: 6, height: height - 20 },
    { x: width - 16, y: 10, width: 6, height: height - 20 },
  ];
  const remapObstacle = (rect) => {
    return {
      ...rect,
      x: mapX(rect.x),
      y: mapY(rect.y),
    };
  };
  const remapWall = (rect) => {
    const x = mapX(rect.x);
    const y = mapY(rect.y);
    return {
      ...rect,
      x,
      y,
      width: mapX(rect.x + rect.width) - x,
      height: mapY(rect.y + rect.height) - y,
    };
  };
  layout.solids = [
    ...outerWalls,
    ...ROOM_BOUNDARIES.map(remapWall),
    ...OBSTACLES.map(remapObstacle),
  ];
  return layout;
}

function createMappedContext(context, layoutRef) {
  const mapPoint = (x, y) => {
    const { width, height } = layoutRef.current;
    return [
      mapAxisCoordinate(x, width, WORLD_W, 303, 697),
      mapAxisCoordinate(y, height, WORLD_H, 205, 395),
    ];
  };
  const pointMethods = new Set(["moveTo", "lineTo", "translate", "rect"]);
  const curveMethods = new Set(["quadraticCurveTo"]);
  const rectMethods = new Set(["fillRect", "strokeRect", "clearRect"]);
  return new Proxy(context, {
    get(target, property) {
      const method = Reflect.get(target, property, target);
      if (typeof method !== "function") return method;
      if (pointMethods.has(property) || rectMethods.has(property)) {
        return (x, y, ...rest) => {
          const [mappedX, mappedY] = mapPoint(x, y);
          return method.call(target, mappedX, mappedY, ...rest);
        };
      }
      if (property === "fillText" || property === "strokeText") {
        return (text, x, y, ...rest) => {
          const [mappedX, mappedY] = mapPoint(x, y);
          return method.call(target, text, mappedX, mappedY, ...rest);
        };
      }
      if (curveMethods.has(property)) {
        return (controlX, controlY, x, y) => {
          const [mappedControlX, mappedControlY] = mapPoint(controlX, controlY);
          const [mappedX, mappedY] = mapPoint(x, y);
          return method.call(target, mappedControlX, mappedControlY, mappedX, mappedY);
        };
      }
      if (property === "bezierCurveTo") {
        return (control1X, control1Y, control2X, control2Y, x, y) => {
          const [mappedControl1X, mappedControl1Y] = mapPoint(control1X, control1Y);
          const [mappedControl2X, mappedControl2Y] = mapPoint(control2X, control2Y);
          const [mappedX, mappedY] = mapPoint(x, y);
          return method.call(target, mappedControl1X, mappedControl1Y, mappedControl2X, mappedControl2Y, mappedX, mappedY);
        };
      }
      if (property === "arc" || property === "ellipse") {
        return (x, y, ...rest) => {
          const [mappedX, mappedY] = mapPoint(x, y);
          return method.call(target, mappedX, mappedY, ...rest);
        };
      }
      if (property === "createLinearGradient") {
        return (x1, y1, x2, y2) => {
          const [mappedX1, mappedY1] = mapPoint(x1, y1);
          const [mappedX2, mappedY2] = mapPoint(x2, y2);
          return method.call(target, mappedX1, mappedY1, mappedX2, mappedY2);
        };
      }
      return method.bind(target);
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}

function checkCollision(cx, cy, radius = AVATAR_RADIUS, layout) {
  const mappedX = mapAxisCoordinate(cx, layout.width, WORLD_W, 303, 697);
  const mappedY = mapAxisCoordinate(cy, layout.height, WORLD_H, 205, 395);
  for (const rect of layout.solids) {
    if (rect.radius) {
      if ((mappedX - rect.x) ** 2 + (mappedY - rect.y) ** 2 < (radius + rect.radius) ** 2) {
        return true;
      }
      continue;
    }
    const nearX = Math.max(rect.x, Math.min(mappedX, rect.x + rect.width));
    const nearY = Math.max(rect.y, Math.min(mappedY, rect.y + rect.height));
    if ((mappedX - nearX) ** 2 + (mappedY - nearY) ** 2 < radius * radius) return true;
  }
  return false;
}

function findOfficePath(start, goal, layout) {
  return findPath(start, goal, {
    width: WORLD_W,
    height: WORLD_H,
    gridSize: PATH_GRID_SIZE,
    sampleSpacing: PATH_SAMPLE_SPACING,
    isBlocked: (x, y) => checkCollision(x, y, AVATAR_RADIUS, layout),
  });
}

// Find nearest collision-free point in 16 radial directions
function findNearestFreePoint(x, y, radius = AVATAR_RADIUS, layout) {
  if (!checkCollision(x, y, radius, layout)) return { x, y };
  const maxSearchRadius = Math.max(
    40,
    ...layout.solids
      .filter((solid) => solid.label)
      .map((solid) => solid.radius
        ? solid.radius + radius
        : Math.hypot(solid.width, solid.height) / 2 + radius * 2)
  );
  for (let r = 2; r <= maxSearchRadius; r += 2) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const tx = Math.max(25, Math.min(WORLD_W - 25, x + Math.cos(a) * r));
      const ty = Math.max(25, Math.min(WORLD_H - 25, y + Math.sin(a) * r));
      if (!checkCollision(tx, ty, radius, layout)) {
        return { x: tx, y: ty };
      }
    }
  }
  return { x, y };
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Colour helpers ───────────────────────────────────────────────────────────
const REMOTE_COLOURS = [
  "#f97316", "#a855f7", "#ec4899", "#14b8a6",
  "#f59e0b", "#64748b", "#06b6d4", "#84cc16",
];
const colourCache = {};
function colourForId(id) {
  if (!colourCache[id]) {
    colourCache[id] = REMOTE_COLOURS[Object.keys(colourCache).length % REMOTE_COLOURS.length];
  }
  return colourCache[id];
}

// ─── Component ────────────────────────────────────────────────────────────────
function VirtualOffice({
  username = "You",
  earshotRadius = 100,
  localStream = null,
  onUsersChange = () => {},
  onSpeakingUsersChange = () => {},
  onChatMessage = () => {},
  onSocketReady = () => {},
  roomName = "default-room",
  screenShareStream = null,
  cameraStream = null,
  onRemoteScreenShareChange = () => {},
  onPositionChange = () => {},
  meetingActions = {},
  peerVolumes = {},
  speakerEnabled = true,
  speakerVolume = 100,
  meetingRooms = [],
  spawnRoom = "Open Work",
  avatarColor = "#2563eb",
}) {
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const renderLayoutRef = useRef(createRenderLayout(WORLD_W, WORLD_H, 1));
  const [positionDisplay, setPositionDisplay] = useState({ x: 160, y: 44 });
  const [zoom, setZoom] = useState(1);
  const [gridVisible, setGridVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const zoomRef = useRef(1);
  const gridVisibleRef = useRef(false);
  const peerVolumesRef = useRef(peerVolumes);
  const meetingActionsRef = useRef(meetingActions);
  const speakerSettingsRef = useRef({ enabled: speakerEnabled, volume: speakerVolume });
  const earshotRef = useRef(earshotRadius);
  const localStreamRef = useRef(localStream);
  const screenShareStreamRef = useRef(screenShareStream);
  const roomNameRef = useRef(roomName);
  const onRemoteScreenShareChangeRef = useRef(onRemoteScreenShareChange);
  const onSpeakingUsersChangeRef = useRef(onSpeakingUsersChange);
  const speakingUserIdsRef = useRef(new Set());
  const speakingLastHeardRef = useRef(new Map());
  const peerConnectionsRef = useRef({});
  const renegotiatePeersRef = useRef(null);
  const pendingCandidatesRef = useRef({});
  const routeRef = useRef([]);
  const clickTargetRef = useRef(null);
  const stuckFramesRef = useRef(0);
  const lastPosRef = useRef({ x: 160, y: 44 });
  const repathCooldownRef = useRef(0);
  const playerFacing = useRef({ angle: 0, moving: false });

  useEffect(() => { earshotRef.current = earshotRadius; }, [earshotRadius]);
  useEffect(() => {
    roomNameRef.current = roomName;
    onRemoteScreenShareChangeRef.current = onRemoteScreenShareChange;
  }, [roomName, onRemoteScreenShareChange]);
  useEffect(() => {
    onSpeakingUsersChangeRef.current = onSpeakingUsersChange;
  }, [onSpeakingUsersChange]);
  useEffect(() => {
    screenShareStreamRef.current = screenShareStream || cameraStream;
    renegotiatePeersRef.current?.();
  }, [screenShareStream, cameraStream]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { gridVisibleRef.current = gridVisible; }, [gridVisible]);
  useEffect(() => { peerVolumesRef.current = peerVolumes; }, [peerVolumes]);
  useEffect(() => { meetingActionsRef.current = meetingActions; }, [meetingActions]);
  useEffect(() => {
    speakerSettingsRef.current = { enabled: speakerEnabled, volume: speakerVolume };
  }, [speakerEnabled, speakerVolume]);
  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === viewportRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === viewportRef.current) {
        await document.exitFullscreen();
      } else {
        await viewportRef.current?.requestFullscreen();
      }
    } catch (error) {
      console.error("[ProxiSpeak] Could not change map fullscreen state:", error);
    }
  };

  const player = useRef({ x: 160, y: 44, username });
  const keys = useRef({});
  const clickTarget = useRef(null);    // { x, y } for click-to-move
  const remotePlayers = useRef({});    // id -> { x, y, targetX, targetY, username }

  useEffect(() => {
    player.current.username = username;
  }, [username]);

  useEffect(() => {
    if (!meetingRooms.length) return;
    const targetRoom = meetingRooms.find((room) =>
      room.name.trim().toLowerCase() === spawnRoom || room.id.trim().toLowerCase() === spawnRoom
    );
    if (targetRoom) {
      // Start in clear walkways rather than inside the room's furniture.
      if (targetRoom.id.toLowerCase() === "meeting room" || targetRoom.name.toLowerCase() === "meeting room") {
        player.current.x = 160;
        player.current.y = 180;
      } else if (targetRoom.id.toLowerCase() === "open workspace" || targetRoom.name.toLowerCase() === "open workspace") {
        player.current.x = WORLD_W / 2;
        player.current.y = 180;
      } else if (targetRoom.id.toLowerCase() === "focus zone" || targetRoom.name.toLowerCase() === "focus zone") {
        player.current.x = 839;
        player.current.y = 140;
      } else {
        const x = targetRoom.x + targetRoom.width / 2;
        const y = targetRoom.y + targetRoom.height / 2;
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          player.current.x = Math.max(35, Math.min(WORLD_W - 35, x));
          player.current.y = Math.max(35, Math.min(WORLD_H - 35, y));
        }
      }
      routeRef.current = [];
      clickTargetRef.current = null;
      clickTarget.current = null;
      stuckFramesRef.current = 0;
    } else {
      // Default spawn in the clear walkway below the meeting table.
      player.current.x = 160;
      player.current.y = 180;
      routeRef.current = [];
      clickTargetRef.current = null;
      clickTarget.current = null;
      stuckFramesRef.current = 0;
    }
  }, [meetingRooms, spawnRoom]);

  // Handle local microphone track updates without reconnecting the socket
  useEffect(() => {
    localStreamRef.current = localStream;
    const audioTrack = localStream?.getAudioTracks()[0] || null;

    if (audioTrack) {
      console.log(`[WebRTC] Local microphone stream updated: trackId=${audioTrack.id}, enabled=${audioTrack.enabled}, readyState=${audioTrack.readyState}`);
    } else {
      console.log("[WebRTC] Local microphone stopped or unavailable");
    }

    // Update senders for all active peer connections
    Object.entries(peerConnectionsRef.current).forEach(([peerId, pc]) => {
      try {
        const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
        const audioTransceiver = transceivers.find(
          (t) => (t.sender?.track?.kind === "audio") || (t.receiver?.track?.kind === "audio")
        );

        if (audioTransceiver && audioTransceiver.sender) {
          audioTransceiver.sender.replaceTrack(audioTrack).then(() => {
            console.log(`[WebRTC] Replaced local audio track on PC for ${peerId} (track=${audioTrack?.id})`);
          }).catch((err) => {
            console.error(`[WebRTC] Failed to replace track for ${peerId}:`, err);
          });
        } else {
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => !s.track || s.track.kind === "audio");
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).then(() => {
              console.log(`[WebRTC] Replaced local audio track on audio sender for ${peerId} (track=${audioTrack?.id})`);
            }).catch((err) => {
              console.error(`[WebRTC] Failed to replace track for ${peerId}:`, err);
            });
          } else if (audioTrack) {
            pc.addTrack(audioTrack, localStream);
            console.log(`[WebRTC] Added local audio track on PC for ${peerId}`);
          }
        }
      } catch (err) {
        console.error(`[WebRTC] Error attaching local track to ${peerId}:`, err);
      }
    });
  }, [localStream]);

  useEffect(() => {
    const speakingLastHeard = speakingLastHeardRef.current;
    let isRunning = true;
    const canvas = canvasRef.current;
    const rawCtx = canvas.getContext("2d");
    const ctx = createMappedContext(rawCtx, renderLayoutRef);
    const resizeCanvas = () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const { width, height } = viewport.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      const layout = createRenderLayout(width, height, dpr);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      renderLayoutRef.current = layout;
    };
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(viewportRef.current);
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // ── Socket.IO ──────────────────────────────────────────────────────────
    const socket = io(SERVER_URL, { transports: ["websocket"], reconnectionAttempts: 5 });

    const negotiatePeer = async (peerId, pc) => {
      if (pc.signalingState !== "stable" || pc.connectionState === "closed") return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { targetId: peerId, offer });
      } catch (err) {
        console.error(`[WebRTC] Screen-share negotiation failed for ${peerId}:`, err);
      }
    };

    renegotiatePeersRef.current = async () => {
      const stream = screenShareStreamRef.current;
      const videoTrack = stream?.getVideoTracks()[0] || null;
      await Promise.all(Object.entries(peerConnectionsRef.current).map(async ([peerId, pc]) => {
        const videoTransceiver = pc.getTransceivers().find((transceiver) =>
          transceiver.receiver.track?.kind === "video"
        );
        const videoSender = videoTransceiver?.sender;
        try {
          if (videoTrack) {
            if (videoSender) await videoSender.replaceTrack(videoTrack);
            else pc.addTrack(videoTrack, stream);
          } else if (videoSender) {
            await videoSender.replaceTrack(null);
          }
          await negotiatePeer(peerId, pc);
        } catch (err) {
          console.error(`[WebRTC] Unable to update screen-share track for ${peerId}:`, err);
        }
      }));
    };

    const notifyPresence = () => {
      const entries = Object.entries(remotePlayers.current).map(([id, user]) => ({
        socketId: id,
        username: user.username || "Guest",
        joinedAt: user.joinedAt,
        x: user.x,
        y: user.y,
        status: user.status || "Available",
      }));

      onUsersChange([
        { socketId: socket.id || "local-user", username, joinedAt: Date.now(), x: player.current.x, y: player.current.y, status: "In office", isSelf: true },
        ...entries,
      ]);
    };

    socket.on("connect", () => {
      console.log("[ProxiSpeak] Connected:", socket.id);
      onSocketReady(socket, [], false, false);
      socket.timeout(5000).emit(
        "join",
        { username, roomName: roomNameRef.current, x: player.current.x, y: player.current.y },
        (error, result) => {
        if (error || !result?.ok) {
          console.error("[ProxiSpeak] Server could not join the selected room.");
          onSocketReady(socket, [], false, true);
          return;
        }
        notifyPresence();
        onSocketReady(socket, result.chatMessages || [], true, false, result.meetingChatMessages || []);
        }
      );
    });
    socket.on("disconnect", () => onSocketReady(null));

    socket.on("chat:message", (msg) => {
      onChatMessage(msg);
    });
    socket.on("chat:direct:message", (msg) => {
      onChatMessage(msg);
    });

    socket.on("users:list", (list) => {
      remotePlayers.current = {};
      (Array.isArray(list) ? list : Object.values(list || {})).forEach((u) => {
        const id = u.socketId || u.id;
        if (id && id !== socket.id) {
          remotePlayers.current[id] = { x: u.x, y: u.y, targetX: u.x, targetY: u.y, username: u.username, joinedAt: u.joinedAt, status: u.status || "Available" };
        }
      });
      notifyPresence();
    });

    socket.on("presence:status", ({ socketId, status } = {}) => {
      if (!socketId || !["Available", "Focus", "Do Not Disturb"].includes(status)) return;
      if (remotePlayers.current[socketId]) remotePlayers.current[socketId].status = status;
      notifyPresence();
    });

    socket.on("user:joined", (u) => {
      const id = u.socketId || u.id;
      if (id && id !== socket.id) {
        remotePlayers.current[id] = { x: u.x, y: u.y, targetX: u.x, targetY: u.y, username: u.username, joinedAt: u.joinedAt, status: u.status || "Available" };
      }
      notifyPresence();
    });

    socket.on("user:moved", (data) => {
      const id = data.socketId || data.id;
      if (!id || id === socket.id) return;
      const p = remotePlayers.current[id];
      if (p) {
        p.targetX = data.x;
        p.targetY = data.y;
        if (data.username && (!p.username || p.username === "?")) {
          p.username = data.username;
        }
      } else {
        remotePlayers.current[id] = {
          x: data.x,
          y: data.y,
          targetX: data.x,
          targetY: data.y,
          username: data.username || ""
        };
      }
      notifyPresence();
    });

    socket.on("user:left", (data) => {
      const id = data?.socketId || data?.id;
      if (id) {
        delete remotePlayers.current[id];
        delete colourCache[id];
        if (peerConnectionsRef.current[id]) {
          try { peerConnectionsRef.current[id].close(); } catch (err) { console.debug("[WebRTC] Peer close note:", err); }
          delete peerConnectionsRef.current[id];
        }
        delete pendingCandidatesRef.current[id];
        const audioEl = document.getElementById(`audio-${id}`);
        if (audioEl) {
          audioEl.pause();
          audioEl.srcObject = null;
          audioEl.remove();
        }
      }
      notifyPresence();
    });

    // ── WebRTC Signaling & Spatial Audio Handshake ────────────────────────
    const peerConnections = peerConnectionsRef.current;
    const pendingCandidates = pendingCandidatesRef.current;

    const drainPendingCandidates = async (peerId, pc) => {
      if (pendingCandidates[peerId] && pendingCandidates[peerId].length > 0) {
        console.log(`[WebRTC] Draining ${pendingCandidates[peerId].length} queued ICE candidate(s) for ${peerId}`);
        const candidates = [...pendingCandidates[peerId]];
        pendingCandidates[peerId] = [];
        for (const cand of candidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (err) {
            console.error(`[WebRTC] Error adding queued ICE candidate for ${peerId}:`, err);
          }
        }
      }
    };

    function setupRemoteAudio(peerId, track, stream = null) {
      if (!track || track.kind !== "audio") return;
      console.log(`[WebRTC] Setting up remote audio playback for ${peerId} (trackId: ${track.id}, readyState: ${track.readyState})`);

      track.onmute = () => {
        console.log(`[WebRTC] Track muted for ${peerId} (waiting for packets)`);
      };
      track.onunmute = () => {
        console.log(`[WebRTC] Track unmuted for ${peerId} (audio packets actively arriving)`);
        const el = document.getElementById(`audio-${peerId}`);
        if (el && el.paused) {
          el.play().catch((err) => console.warn(`[WebRTC] Autoplay on unmute failed for ${peerId}:`, err));
        }
      };
      track.onended = () => {
        console.log(`[WebRTC] Track ended for ${peerId}`);
      };

      let audioEl = document.getElementById(`audio-${peerId}`);
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = `audio-${peerId}`;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
      }

      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.muted = false; // CRITICAL: Remote audio must be unmuted to be heard

      // Initial distance volume
      const peer = remotePlayers.current[peerId];
      const myX = player.current.x;
      const myY = player.current.y;
      let gain = 1.0;
      if (peer) {
        const dist = Math.hypot(peer.x - myX, peer.y - myY);
        const maxDist = earshotRef.current || 100;
        gain = Math.max(0, Math.min(1, 1 - dist / maxDist));
      }
      const individualVolume = Math.max(0, Math.min(100, Number(peerVolumesRef.current[peerId] ?? 100))) / 100;
      const masterVolume = speakerSettingsRef.current.enabled ? speakerSettingsRef.current.volume / 100 : 0;
      audioEl.volume = Math.max(0, Math.min(1, gain * individualVolume * masterVolume));

      let mediaStream = stream;
      if (!mediaStream) {
        if (audioEl.srcObject instanceof MediaStream) {
          mediaStream = audioEl.srcObject;
        } else {
          mediaStream = new MediaStream();
        }
      }
      if (!mediaStream.getTracks().includes(track)) {
        mediaStream.addTrack(track);
      }

      if (audioEl.srcObject !== mediaStream) {
        audioEl.srcObject = mediaStream;
      }

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[WebRTC] Audio playback active for ${peerId} (volume: ${audioEl.volume.toFixed(2)}, muted: ${audioEl.muted})`);
          })
          .catch((err) => {
            console.warn(`[WebRTC] Audio playback blocked by autoplay policy for ${peerId}. Audio will resume on user interaction:`, err);
          });
      }
    }

    function getOrCreatePC(peerId, isInitiator = false) {
      if (peerConnections[peerId]) {
        const existing = peerConnections[peerId];
        if (existing.signalingState !== "closed" && existing.connectionState !== "closed" && existing.connectionState !== "failed") {
          return existing;
        }
        try { existing.close(); } catch (err) { console.debug("[WebRTC] Stale PC close note:", err); }
        delete peerConnections[peerId];
      }

      console.log(`[WebRTC] Creating new RTCPeerConnection for ${peerId} (isInitiator=${isInitiator})`);
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      // Send local audio track if mic is enabled, or add transceiver for offerer
      if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          console.log(`[WebRTC] Adding local audio track (${track.id}, enabled=${track.enabled}) to PC for ${peerId}`);
          pc.addTrack(track, localStreamRef.current);
        });
      } else if (isInitiator) {
        console.log(`[WebRTC] Local mic not active yet, adding audio transceiver for offerer ${peerId}`);
        pc.addTransceiver("audio", { direction: "sendrecv" });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { targetId: peerId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE connection state with ${peerId}: ${pc.iceConnectionState}`);
      };

      pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC] ICE gathering state with ${peerId}: ${pc.iceGatheringState}`);
      };

      pc.ontrack = (event) => {
        if (event.track.kind === "video") {
          const stream = event.streams?.[0] || new MediaStream([event.track]);
          onRemoteScreenShareChangeRef.current({
            stream,
            socketId: peerId,
            username: remotePlayers.current[peerId]?.username || "Teammate"
          });
          event.track.onended = () => onRemoteScreenShareChangeRef.current({ socketId: peerId });
          return;
        }
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : null;
        setupRemoteAudio(peerId, event.track, stream);
      };

      const shareTrack = screenShareStreamRef.current?.getVideoTracks()[0];
      if (shareTrack) {
        pc.addTrack(shareTrack, screenShareStreamRef.current);
      }

      peerConnections[peerId] = pc;
      return pc;
    }

    // Helper to dynamically update volume as avatars move
    function updateAudioSpatialMixer() {
      const myX = player.current.x;
      const myY = player.current.y;
      const maxDist = earshotRef.current || 100;

      Object.entries(remotePlayers.current).forEach(([peerId, peer]) => {
        const audioEl = document.getElementById(`audio-${peerId}`);
        if (!audioEl) return;

        const dist = Math.hypot(peer.x - myX, peer.y - myY);
        // Linear falloff: 1 at dist=0, 0 at dist >= maxDist
        const gain = Math.max(0, Math.min(1, 1 - dist / maxDist));
        const individualVolume = Math.max(0, Math.min(100, Number(peerVolumesRef.current[peerId] ?? 100))) / 100;
        const masterVolume = speakerSettingsRef.current.enabled ? speakerSettingsRef.current.volume / 100 : 0;
        audioEl.volume = Math.max(0, Math.min(1, gain * individualVolume * masterVolume));
      });
    }

    socket.on("nearby:enter", async ({ socketId, id, username, shouldInitiateOffer }) => {
      const peerId = socketId || id;
      if (!peerId) return;
      if (username && remotePlayers.current[peerId] && (!remotePlayers.current[peerId].username || remotePlayers.current[peerId].username === "?")) {
        remotePlayers.current[peerId].username = username;
      }
      console.log(`[ProxiSpeak] nearby:enter from ${peerId}, initiateOffer=${shouldInitiateOffer}`);
      const pc = getOrCreatePC(peerId, shouldInitiateOffer);

      if (shouldInitiateOffer) {
        if (pc.signalingState !== "stable") {
          console.log(`[WebRTC] Skipping offer creation for ${peerId}: signalingState is '${pc.signalingState}'`);
          return;
        }
        if (pc.connectionState === "connected") {
          console.log(`[WebRTC] Skipping offer creation for ${peerId}: connectionState is already 'connected'`);
          return;
        }
        try {
          await negotiatePeer(peerId, pc);
          console.log(`[WebRTC] Sent offer to ${peerId}`);
        } catch (err) {
          console.error("[WebRTC] Create offer error:", err);
        }
      }
    });

    socket.on("nearby:leave", ({ socketId, id }) => {
      const peerId = socketId || id;
      console.log(`[ProxiSpeak] nearby:leave from ${peerId}`);
      if (peerConnections[peerId]) {
        try { peerConnections[peerId].close(); } catch (err) { console.debug("[WebRTC] Peer close note:", err); }
        delete peerConnections[peerId];
      }
      onRemoteScreenShareChangeRef.current({ socketId: peerId });
      delete pendingCandidates[peerId];
      const audioEl = document.getElementById(`audio-${peerId}`);
      if (audioEl) {
        audioEl.pause();
        audioEl.srcObject = null;
        audioEl.remove();
      }
    });

    socket.on("webrtc:offer", async ({ senderId, offer }) => {
      console.log("[WebRTC] Received offer from:", senderId);
      const pc = getOrCreatePC(senderId, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await drainPendingCandidates(senderId, pc);

        // Ensure the transceiver negotiated from the offer is set to sendrecv
        const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
        const audioTransceiver = transceivers.find(
          (t) => (t.sender?.track?.kind === "audio") || (t.receiver?.track?.kind === "audio")
        );
        if (audioTransceiver) {
          if (audioTransceiver.direction !== "sendrecv") {
            audioTransceiver.direction = "sendrecv";
          }
          if (localStreamRef.current && localStreamRef.current.getAudioTracks().length > 0) {
            const track = localStreamRef.current.getAudioTracks()[0];
            await audioTransceiver.sender.replaceTrack(track);
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { targetId: senderId, answer });
        console.log(`[WebRTC] Sent answer to ${senderId}`);

        // Ensure remote audio playback is attached for the answerer
        pc.getReceivers().forEach((receiver) => {
          if (receiver.track && receiver.track.kind === "audio") {
            setupRemoteAudio(senderId, receiver.track);
          }
        });
      } catch (err) {
        console.error("[WebRTC] Error handling offer:", err);
      }
    });

    socket.on("webrtc:answer", async ({ senderId, answer }) => {
      console.log("[WebRTC] Received answer from:", senderId);
      const pc = peerConnections[senderId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await drainPendingCandidates(senderId, pc);
          console.log(`[WebRTC] Remote description set for answer from ${senderId}`);

          // Ensure remote audio playback is attached for the offerer
          pc.getReceivers().forEach((receiver) => {
            if (receiver.track && receiver.track.kind === "audio") {
              setupRemoteAudio(senderId, receiver.track);
            }
          });
        } catch (err) {
          console.error("[WebRTC] Error handling answer:", err);
        }
      }
    });

    socket.on("webrtc:ice-candidate", async ({ senderId, candidate }) => {
      if (!candidate) return;
      const pc = peerConnections[senderId];
      if (!pc || !pc.remoteDescription) {
        if (!pendingCandidates[senderId]) pendingCandidates[senderId] = [];
        pendingCandidates[senderId].push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[WebRTC] Error adding ICE candidate:", err);
      }
    });

    // ── Unlock blocked audio on user interactions ───────────────────────────
    const unlockAudio = () => {
      document.querySelectorAll('audio[id^="audio-"]').forEach((el) => {
        if (el.paused && el.srcObject) {
          el.play().catch((err) => {
            console.warn("[WebRTC] Autoplay unlock retry:", err);
          });
        }
      });
      if (window._proxAudioCtx && window._proxAudioCtx.state === "suspended") {
        window._proxAudioCtx.resume().catch((err) => { console.debug("[WebAudio] Resume note:", err); });
      }
    };
    window.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    window.addEventListener("touchstart", unlockAudio);

    // ── Keyboard ───────────────────────────────────────────────────────────
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        clickTarget.current = null; // cancel click-to-move when key pressed
      }
      keys.current[k] = true;
    };
    const onKeyUp = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── Click-to-move ──────────────────────────────────────────────────────
    const onCanvasClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const layout = renderLayoutRef.current;
      const currentZoom = zoomRef.current;
      const screenX = (e.clientX - rect.left) / layout.scale;
      const screenY = (e.clientY - rect.top) / layout.scale;
      const renderedX = (screenX - layout.width / 2) / currentZoom + layout.width / 2;
      const renderedY = (screenY - layout.height / 2) / currentZoom + layout.height / 2;
      let tx = Math.round(unmapAxisCoordinate(renderedX, layout.width, WORLD_W, 303, 697));
      let ty = Math.round(unmapAxisCoordinate(renderedY, layout.height, WORLD_H, 205, 395));
      tx = Math.max(25, Math.min(WORLD_W - 25, tx));
      ty = Math.max(25, Math.min(WORLD_H - 25, ty));
      let target = { x: tx, y: ty };
      if (checkCollision(target.x, target.y, AVATAR_RADIUS, layout)) {
        target = findNearestFreePoint(target.x, target.y, AVATAR_RADIUS, layout);
        if (checkCollision(target.x, target.y, AVATAR_RADIUS, layout)) {
          routeRef.current = [];
          clickTargetRef.current = null;
          clickTarget.current = null;
          return;
        }
      }

      const path = findOfficePath({ x: player.current.x, y: player.current.y }, target, layout);
      if (!path.length) {
        routeRef.current = [];
        clickTargetRef.current = null;
        clickTarget.current = null;
        return;
      }
      const destination = path[path.length - 1];
      routeRef.current = path;
      clickTargetRef.current = destination;
      clickTarget.current = destination;
    };
    canvas.addEventListener("click", onCanvasClick);

    // ── Game loop ──────────────────────────────────────────────────────────
    let rafId;
    let lastEmitTime = 0;
    let lastSentX = player.current.x;
    let lastSentY = player.current.y;
    const SPEED = 3;
    const LERP = 0.2;
    const CLICK_SPEED = 3;
    let speakingPollInProgress = false;

    const pollSpeakingActivity = async () => {
      if (speakingPollInProgress) return;
      speakingPollInProgress = true;

      try {
        const now = performance.now();
        const audioStats = await Promise.all(
          Object.entries(peerConnections).map(async ([peerId, pc]) => {
            if (pc.connectionState === "closed" || pc.connectionState === "failed") return null;
            try {
              return { peerId, reports: await pc.getStats() };
            } catch {
              return null;
            }
          })
        );
        if (!isRunning) return;

        audioStats.forEach((result) => {
          if (!result) return;
          result.reports.forEach((report) => {
            const isAudio = report.kind === "audio" || report.mediaType === "audio";
            if (!isAudio || typeof report.audioLevel !== "number" || report.audioLevel < 0.025) return;

            if (report.type === "inbound-rtp") {
              speakingLastHeardRef.current.set(result.peerId, now);
            } else if (
              report.type === "media-source" &&
              localStreamRef.current?.getAudioTracks().some((track) => track.enabled && track.readyState === "live")
            ) {
              speakingLastHeardRef.current.set(socket.id, now);
            }
          });
        });

        const activeUsers = new Set(
          [...speakingLastHeardRef.current]
            .filter(([id, lastHeard]) => now - lastHeard < 500 && (id === socket.id || remotePlayers.current[id]))
            .map(([id]) => id)
        );
        for (const id of speakingLastHeardRef.current.keys()) {
          if (!activeUsers.has(id)) speakingLastHeardRef.current.delete(id);
        }

        const currentUsers = speakingUserIdsRef.current;
        const hasChanged = activeUsers.size !== currentUsers.size
          || [...activeUsers].some((id) => !currentUsers.has(id));
        if (hasChanged) {
          speakingUserIdsRef.current = activeUsers;
          onSpeakingUsersChangeRef.current([...activeUsers]);
        }
      } finally {
        speakingPollInProgress = false;
      }
    };

    const speakingPollTimer = window.setInterval(pollSpeakingActivity, 180);
    const positionDisplayTimer = window.setInterval(() => {
      const position = {
        x: Math.round(player.current.x),
        y: Math.round(player.current.y),
      };
      setPositionDisplay((current) =>
        current.x === position.x && current.y === position.y ? current : position
      );
      onPositionChange(position);
    }, 250);

    function gameLoop() {
      if (!isRunning) return;
      const layout = renderLayoutRef.current;

      // ─── Movement ─────────────────────────────────────────────────────
      let dx = 0;
      let dy = 0;

      const k = keys.current;
      if (k["arrowup"] || k["w"]) dy -= SPEED;
      if (k["arrowdown"] || k["s"]) dy += SPEED;
      if (k["arrowleft"] || k["a"]) dx -= SPEED;
      if (k["arrowright"] || k["d"]) dx += SPEED;

      // If the player presses any keyboard key, cancel the click-to-move route immediately
      // so the avatar doesn't snap back to the previously clicked position on key release.
      if (dx !== 0 || dy !== 0) {
        if (routeRef.current.length > 0 || clickTarget.current || clickTargetRef.current) {
          routeRef.current = [];
          clickTarget.current = null;
          clickTargetRef.current = null;
          stuckFramesRef.current = 0;
        }
      }

      if (dx === 0 && dy === 0 && routeRef.current.length > 0) {
        const nextPoint = routeRef.current[0];
        const tdx = nextPoint.x - player.current.x;
        const tdy = nextPoint.y - player.current.y;
        const dist = Math.hypot(tdx, tdy);

        if (dist <= CLICK_SPEED) {
          if (checkCollision(nextPoint.x, nextPoint.y, AVATAR_RADIUS, layout)) {
            routeRef.current = [];
            clickTarget.current = null;
            clickTargetRef.current = null;
          } else {
            player.current.x = nextPoint.x;
            player.current.y = nextPoint.y;
            routeRef.current.shift();
            if (routeRef.current.length === 0) {
              clickTarget.current = null;
              clickTargetRef.current = null;
            }
          }
        } else {
          dx = (tdx / dist) * CLICK_SPEED;
          dy = (tdy / dist) * CLICK_SPEED;
        }
      }

      if (dx !== 0 || dy !== 0) {
        playerFacing.current.angle = Math.atan2(dy, dx);
        playerFacing.current.moving = true;
      } else {
        playerFacing.current.moving = false;
      }

      // Unstuck emergency escape: If player starts or grazes inside an obstacle/wall, smoothly nudge into nearest free space
      if (checkCollision(player.current.x, player.current.y, AVATAR_RADIUS, layout)) {
        const freePoint = findNearestFreePoint(player.current.x, player.current.y, AVATAR_RADIUS, layout);
        player.current.x = freePoint.x;
        player.current.y = freePoint.y;
      }

      if (dx !== 0) {
        const nx = Math.max(25, Math.min(WORLD_W - 25, player.current.x + dx));
        if (!checkCollision(nx, player.current.y, AVATAR_RADIUS, layout)) {
          player.current.x = nx;
        }
      }
      if (dy !== 0) {
        const ny = Math.max(25, Math.min(WORLD_H - 25, player.current.y + dy));
        if (!checkCollision(player.current.x, ny, AVATAR_RADIUS, layout)) {
          player.current.y = ny;
        }
      }

      // ── Stuck detection & dynamic self-rebuilding path logic ─────────────────
      const intendedMove = (dx !== 0 || dy !== 0) || Boolean(clickTargetRef.current);
      const actualDist = Math.hypot(player.current.x - lastPosRef.current.x, player.current.y - lastPosRef.current.y);
      lastPosRef.current = { x: player.current.x, y: player.current.y };

      if (repathCooldownRef.current > 0) {
        repathCooldownRef.current--;
      }

      if (intendedMove && actualDist < 0.25) {
        stuckFramesRef.current += 1;
      } else {
        stuckFramesRef.current = 0;
      }

      // If avatar has been blocked for >= 8 frames (~130ms), autonomously recover and rebuild path
      if (stuckFramesRef.current >= 8 && repathCooldownRef.current === 0) {
        repathCooldownRef.current = 10; // Prevent thrashing

        // 1. First gently nudge away from any collision boundary
        const nudged = findNearestFreePoint(player.current.x, player.current.y, AVATAR_RADIUS, layout);
        player.current.x = nudged.x;
        player.current.y = nudged.y;

        const target = clickTargetRef.current;
        if (target) {
          const newPath = findOfficePath(
            { x: player.current.x, y: player.current.y },
            target,
            layout
          );

          if (newPath && newPath.length > 0) {
            routeRef.current = newPath;
            stuckFramesRef.current = 0;
          } else if (stuckFramesRef.current >= 35) {
            // Destination is completely enclosed or unreachable; cleanly release
            routeRef.current = [];
            clickTarget.current = null;
            clickTargetRef.current = null;
            stuckFramesRef.current = 0;
          }
        } else if (routeRef.current.length > 1) {
          routeRef.current.shift();
          stuckFramesRef.current = 0;
        }
      }

      // ─── Throttled emit (~30/sec) ─────────────────────────────────────
      const now = performance.now();
      if ((player.current.x !== lastSentX || player.current.y !== lastSentY) && now - lastEmitTime >= 33) {
        lastSentX = player.current.x;
        lastSentY = player.current.y;
        lastEmitTime = now;
        socket.emit("move", { x: player.current.x, y: player.current.y });
      }

      // ─── Lerp remote avatars ──────────────────────────────────────────
      Object.values(remotePlayers.current).forEach((rp) => {
        rp.x += (rp.targetX - rp.x) * LERP;
        rp.y += (rp.targetY - rp.y) * LERP;
        if (Math.abs(rp.targetX - rp.x) < 0.1) rp.x = rp.targetX;
        if (Math.abs(rp.targetY - rp.y) < 0.1) rp.y = rp.targetY;
      });

      // Update volume in real time as players move
      updateAudioSpatialMixer();

      // ─── Render ───────────────────────────────────────────────────────
      rawCtx.setTransform(layout.scale * layout.dpr, 0, 0, layout.scale * layout.dpr, 0, 0);
      rawCtx.clearRect(0, 0, layout.width, layout.height);
      rawCtx.save();
      rawCtx.translate(layout.width / 2, layout.height / 2);
      rawCtx.scale(zoomRef.current, zoomRef.current);
      rawCtx.translate(-layout.width / 2, -layout.height / 2);
      ctx.save();

      // ── HELPER: draw rounded rect path ──────────────────────────────
      const mapX = (x) => mapAxisCoordinate(x, layout.width, WORLD_W, 303, 697);
      const mapY = (y) => mapAxisCoordinate(y, layout.height, WORLD_H, 205, 395);
      const rr = (rx, ry, rw, rh, rad) => {
        drawRoundedRect(rawCtx, mapX(rx), mapY(ry), rw, rh, rad);
      };
      const drawPlant = (px, py) => {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(px, py + 16, 11, 3, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(35,42,38,0.12)";
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(px, py + 8);
        ctx.lineTo(px, py - 9);
        ctx.moveTo(px, py - 1);
        ctx.lineTo(px - 8, py - 9);
        ctx.moveTo(px, py + 2);
        ctx.lineTo(px + 8, py - 7);
        ctx.strokeStyle = "#587451";
        ctx.lineWidth = 2;
        ctx.stroke();

        [
          [px, py - 11, 5, 8, 0, "#6f9466"],
          [px - 9, py - 10, 5, 8, -0.75, "#789a6d"],
          [px + 9, py - 8, 5, 8, 0.75, "#62875b"],
        ].forEach(([x, y, radiusX, radiusY, rotation, color]) => {
          ctx.beginPath();
          ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        });

        rr(px - 9, py + 5, 18, 12, 3);
        ctx.fillStyle = "#a96f54";
        ctx.fill();
        ctx.strokeStyle = "#8b5843";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(px, py + 5, 8, 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#6b503c";
        ctx.fill();
        ctx.restore();
      };

      // ── 1. FLOOR BACKGROUND ──────────────────────────────────────────
      const bgGrad = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
      bgGrad.addColorStop(0, "#ede9f6");
      bgGrad.addColorStop(1, "#e0dbf0");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, layout.width, layout.height);

      // Subtle floor texture dots
      ctx.fillStyle = "rgba(140,120,200,0.055)";
      for (let gx = 30; gx < WORLD_W; gx += 30) {
        for (let gy = 30; gy < WORLD_H; gy += 30) {
          ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (gridVisibleRef.current) {
        ctx.beginPath();
        for (let gx = 0; gx <= WORLD_W; gx += GRID_SIZE) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, WORLD_H);
        }
        for (let gy = 0; gy <= WORLD_H; gy += GRID_SIZE) {
          ctx.moveTo(0, gy);
          ctx.lineTo(WORLD_W, gy);
        }
        ctx.strokeStyle = "rgba(89,82,129,0.18)";
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // ── 2. ROOM ZONES (no overlap) ───────────────────────────────────
      const drawRoom = (rx, ry, rw, rh, label, fillColor) => {
        ctx.save();
        drawRoundedRect(rawCtx, mapX(rx), mapY(ry), mapX(rx + rw) - mapX(rx), mapY(ry + rh) - mapY(ry), 16);
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.strokeStyle = "rgba(140,120,200,0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "rgba(55,50,100,0.7)";
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, rx + rw / 2, ry + 18);
        ctx.restore();
      };

      // Layout: Meeting Room TL, Focus Zone TR, Lounge BL, Pantry BR
      drawRoom(18, 18, 285, 185, "Meeting Room", "rgba(228,224,248,0.88)");
      drawRoom(697, 18, 285, 185, "Focus Zone",   "rgba(220,232,248,0.88)");
      drawRoom(OPEN_WORKSPACE.x, OPEN_WORKSPACE.y, OPEN_WORKSPACE.width, OPEN_WORKSPACE.height, "Open Workspace", "rgba(240,238,252,0.65)");
      drawRoom(18,  395, 285, 190, "Lounge",      "rgba(238,228,250,0.88)");
      drawRoom(697, 395, 285, 190, "Pantry",      "rgba(220,236,250,0.88)");

      // ── 3. CENTER HEADER LOGO ────────────────────────────────────────
      ctx.save();
      rr(360, 18, 280, 52, 12);
      ctx.fillStyle = "rgba(18,16,46,0.84)";
      ctx.fill();
      const barH = [10, 18, 14, 10];
      barH.forEach((h, b) => {
        ctx.fillStyle = "#a78bfa";
        ctx.fillRect(380 + b * 10, 40 - h / 2, 7, h);
      });
      ctx.fillStyle = "#e0d7ff";
      ctx.font = "bold 14px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ProxiSpeak", 423, 42);
      ctx.fillStyle = "rgba(190,180,255,0.7)";
      ctx.font = "9px Inter, sans-serif";
      ctx.fillText("Work • Talk • Connect", 423, 56);
      ctx.restore();

      // ── 4. MEETING ROOM FURNITURE ────────────────────────────────────
      ctx.save();
      // Large conference table
      rr(52, 68, 205, 68, 10);
      ctx.fillStyle = "#c8b98a"; ctx.fill();
      ctx.strokeStyle = "#a89060"; ctx.lineWidth = 1.5; ctx.stroke();
      // Chairs top
      for (let i = 0; i < 4; i++) { rr(64 + i * 48, 54, 28, 12, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill(); }
      // Chairs bottom
      for (let i = 0; i < 4; i++) { rr(64 + i * 48, 138, 28, 12, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill(); }
      // Chairs sides
      rr(34, 95, 12, 28, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      rr(230, 95, 12, 28, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      drawPlant(40, 172);
      ctx.restore();

      // ── 5. FOCUS ZONE FURNITURE ──────────────────────────────────────
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const dx = 712 + i * 86; const dy = 48;
        rr(dx, dy, 70, 42, 6); ctx.fillStyle = "#c8b98a"; ctx.fill();
        ctx.strokeStyle = "#a89060"; ctx.lineWidth = 1; ctx.stroke();
        rr(dx + 17, dy + 6, 36, 24, 3); ctx.fillStyle = "#2a2a40"; ctx.fill();
        rr(dx + 19, dy + 8, 32, 20, 2); ctx.fillStyle = i % 2 === 0 ? "#2d3a7a" : "#1a3050"; ctx.fill();
        rr(dx + 17, dy + 50, 36, 15, 5); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      }
      ctx.restore();

      // ── 6. OPEN WORKSPACE DESKS (CENTER AREA) ───────────────────────
      ctx.save();
      OPEN_WORKSPACE_DESKS.forEach((dp, idx) => {
        rr(dp.x, dp.y, 85, 46, 6); ctx.fillStyle = "#c8b98a"; ctx.fill();
        ctx.strokeStyle = "#a89060"; ctx.lineWidth = 1; ctx.stroke();
        rr(dp.x+22, dp.y+6, 40, 26, 3); ctx.fillStyle = "#1e1e34"; ctx.fill();
        rr(dp.x+24, dp.y+8, 36, 22, 2); ctx.fillStyle = idx%2===0?"#2d3a7a":"#1a3050"; ctx.fill();
        rr(dp.x+24, dp.y+52, 36, 14, 5); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      });
      ctx.restore();

      // ── 7. LOUNGE FURNITURE ──────────────────────────────────────────
      ctx.save();
      rr(42, 440, 115, 55, 12); ctx.fillStyle = "#5a6fa0"; ctx.fill();
      ctx.strokeStyle="#4a5f90"; ctx.lineWidth=1; ctx.stroke();
      rr(48, 448, 48, 38, 8); ctx.fillStyle="#7a8fc0"; ctx.fill();
      rr(102, 448, 48, 38, 8); ctx.fillStyle="#7a8fc0"; ctx.fill();
      rr(52, 508, 95, 38, 8); ctx.fillStyle="#b8a870"; ctx.fill();
      ctx.strokeStyle="#988850"; ctx.lineWidth=1; ctx.stroke();
      ctx.restore();

      // ── 8. PANTRY FURNITURE ──────────────────────────────────────────
      ctx.save();
      rr(702, 420, 268, 38, 8); ctx.fillStyle="#b0b8c8"; ctx.fill();
      ctx.strokeStyle="#909aaa"; ctx.lineWidth=1; ctx.stroke();
      rr(712, 426, 36, 26, 4); ctx.fillStyle="#555566"; ctx.fill();
      rr(756, 426, 28, 26, 4); ctx.fillStyle="#666677"; ctx.fill();
      rr(793, 426, 50, 26, 4); ctx.fillStyle="#4a4a5a"; ctx.fill();
      rr(702, 396, 268, 20, 4); ctx.fillStyle="#c8d0d8"; ctx.fill();
      rr(870, 420, 60, 38, 6); ctx.fillStyle="#c0c8d0"; ctx.fill();
      rr(880, 428, 40, 22, 4); ctx.fillStyle="#a0a8b0"; ctx.fill();
      drawPlant(940, 535);
      ctx.restore();

      // ── 9. GLASS PARTITION LINES WITH VISIBLE ENTRANCES ────────────
      ctx.save();
      ctx.strokeStyle = "rgba(110,100,180,0.45)";
      ctx.lineWidth = 3;

      // Vertical partitions with doorway gaps (doorway = 100px clear gap for walking)
      // Top left Meeting room (right wall x: 303, entrance at y: 65..165)
      ctx.beginPath(); ctx.moveTo(303, 18); ctx.lineTo(303, 65); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(303, 165); ctx.lineTo(303, 205); ctx.stroke();
      // Doorway indicator (Meeting room entrance)
      ctx.fillStyle = "rgba(99,102,241,0.15)";
      ctx.fillRect(298, 65, 10, 100);

      // Top right Focus zone (left wall x: 697, entrance at y: 65..165)
      ctx.beginPath(); ctx.moveTo(697, 18); ctx.lineTo(697, 65); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(697, 165); ctx.lineTo(697, 205); ctx.stroke();
      // Doorway indicator (Focus zone entrance)
      ctx.fillStyle = "rgba(99,102,241,0.15)";
      ctx.fillRect(692, 65, 10, 100);

      // Bottom left Lounge (right wall x: 303, entrance at y: 420..525)
      ctx.beginPath(); ctx.moveTo(303, 395); ctx.lineTo(303, 420); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(303, 525); ctx.lineTo(303, 582); ctx.stroke();
      ctx.fillStyle = "rgba(99,102,241,0.15)";
      ctx.fillRect(298, 420, 10, 105);

      // Bottom right Pantry (left wall x: 697, entrance at y: 420..525)
      ctx.beginPath(); ctx.moveTo(697, 395); ctx.lineTo(697, 420); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(697, 525); ctx.lineTo(697, 582); ctx.stroke();
      ctx.fillStyle = "rgba(99,102,241,0.15)";
      ctx.fillRect(692, 420, 10, 105);

      // Horizontal dividers
      ctx.beginPath(); ctx.moveTo(18, 205); ctx.lineTo(303, 205); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(697, 205); ctx.lineTo(982, 205); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 395); ctx.lineTo(303, 395); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(697, 395); ctx.lineTo(982, 395); ctx.stroke();
      ctx.restore();

      // ── 10. DESTINATION MARKER & PATH PREVIEW (A* pathfinding feedback) ───
      if (clickTarget.current || routeRef.current.length > 0) {
        const route = routeRef.current.length > 1 ? routeRef.current : [];
        if (route.length > 1) {
          ctx.beginPath();
          route.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.strokeStyle = "rgba(99,102,241,0.65)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Animated destination marker with pulsing rings
        const target = clickTarget.current || (route.length > 0 ? route[route.length - 1] : null);
        if (target) {
          const pulse = (performance.now() % 1000) / 1000;
          ctx.save();
          // Expanding outer pulse ring
          ctx.beginPath();
          ctx.arc(target.x, target.y, 8 + pulse * 14, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(99,102,241,${0.8 * (1 - pulse)})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Target pin center
          ctx.beginPath();
          ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = "#6350ff";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();

          // Crosshairs
          ctx.strokeStyle = "#6350ff";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(target.x - 10, target.y); ctx.lineTo(target.x + 10, target.y);
          ctx.moveTo(target.x, target.y - 10); ctx.lineTo(target.x, target.y + 10);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── 11. EARSHOT CIRCLE ──────────────────────────────────────────
      const earshot = earshotRef.current;
      ctx.beginPath();
      ctx.arc(player.current.x, player.current.y, earshot, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(99,102,241,0.05)"; ctx.fill();
      ctx.strokeStyle = "rgba(99,102,241,0.25)"; ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);

      // ── 12. AVATAR DRAWING HELPER (with Directional Animation) ─────
      const drawAvatar = (ax, ay, color, initials, name, isLocal, facingAngle = 0, isMoving = false, isSpeaking = false, action = null) => {
        const R = AVATAR_RADIUS;
        const avatarX = mapX(ax);
        const avatarY = mapY(ay);
        if (isSpeaking) {
          const phase = performance.now() / 90;
          rawCtx.save();
          rawCtx.fillStyle = "#2bd67b";
          rawCtx.shadowColor = "rgba(43,214,123,0.65)";
          rawCtx.shadowBlur = 7;
          [-1, 0, 1].forEach((bar, index) => {
            const height = 4 + (Math.sin(phase + index * 1.3) + 1) * 3;
            rawCtx.fillRect(avatarX + bar * 5 - 1.5, avatarY - R - 7 - height, 3, height);
          });
          rawCtx.restore();
        }

        // Glow ring for local user
        if (isLocal) {
          rawCtx.save();
          rawCtx.shadowBlur = 20; rawCtx.shadowColor = "rgba(99,102,241,0.9)";
          rawCtx.beginPath(); rawCtx.arc(avatarX, avatarY, R + 4, 0, Math.PI * 2);
          rawCtx.strokeStyle = "rgba(140,120,255,0.75)"; rawCtx.lineWidth = 2.5; rawCtx.stroke();
          rawCtx.restore();
        }

        // Direction pointer / visor indicator when moving or facing
        rawCtx.save();
        rawCtx.translate(avatarX, avatarY);
        rawCtx.rotate(facingAngle);
        // Small directional arrowhead / pointer on avatar rim
        rawCtx.beginPath();
        rawCtx.moveTo(R + 5, 0);
        rawCtx.lineTo(R - 2, -4);
        rawCtx.lineTo(R - 2, 4);
        rawCtx.closePath();
        rawCtx.fillStyle = isLocal ? "#6350ff" : "#4ade80";
        rawCtx.fill();
        rawCtx.restore();

        // Walking wobble bounce when moving
        const bounce = isMoving ? Math.sin(performance.now() / 100) * 1.5 : 0;
        const avatarDrawY = avatarY + bounce;

        // Avatar fill
        rawCtx.save();
        rawCtx.beginPath(); rawCtx.arc(avatarX, avatarDrawY, R, 0, Math.PI * 2);
        rawCtx.fillStyle = color; rawCtx.fill();
        rawCtx.strokeStyle = "#fff"; rawCtx.lineWidth = 2.5; rawCtx.stroke();
        rawCtx.restore();

        // Green online dot
        rawCtx.save();
        rawCtx.beginPath(); rawCtx.arc(avatarX + R * 0.65, avatarDrawY + R * 0.65, 5, 0, Math.PI * 2);
        rawCtx.fillStyle = "#2bd67b"; rawCtx.fill();
        rawCtx.strokeStyle = "#fff"; rawCtx.lineWidth = 1.5; rawCtx.stroke();
        rawCtx.restore();

        // Initials
        rawCtx.fillStyle = "#fff"; rawCtx.font = "bold 11px Inter, sans-serif";
        rawCtx.textAlign = "center"; rawCtx.fillText(initials, avatarX, avatarDrawY + 4);

        // Name pill below
        rawCtx.save();
        const nameW = rawCtx.measureText(name).width + 14;
        drawRoundedRect(rawCtx, avatarX - nameW / 2, avatarDrawY + R + 6, nameW, 17, 8);
        rawCtx.fillStyle = "rgba(18,16,46,0.65)"; rawCtx.fill();
        rawCtx.fillStyle = "#fff"; rawCtx.font = "bold 10px Inter, sans-serif";
        rawCtx.textAlign = "center"; rawCtx.fillText(name, avatarX, avatarDrawY + R + 17);
        if (action?.action === "hand" && action.value) {
          rawCtx.font = "16px sans-serif";
          rawCtx.fillText("✋", avatarX, avatarDrawY - R - 12);
        } else if (action?.action === "reaction") {
          rawCtx.font = "18px sans-serif";
          rawCtx.fillText(action.value, avatarX, avatarDrawY - R - 12);
        }
        rawCtx.restore();
      };

      // ── 13. REMOTE AVATARS ──────────────────────────────────────────
      Object.entries(remotePlayers.current).forEach(([id, rp]) => {
        const dist = Math.hypot(rp.x - player.current.x, rp.y - player.current.y);
        const inEarshot = dist <= earshot;
        const colour = inEarshot ? colourForId(id) : "rgba(110,110,130,0.5)";
        const displayName = rp.username && rp.username.trim() ? rp.username : "?";
        const ini = displayName.split(" ").map(p => p[0] || "").slice(0, 2).join("").toUpperCase() || "?";
        const moving = Math.abs(rp.targetX - rp.x) > 0.5 || Math.abs(rp.targetY - rp.y) > 0.5;
        const angle = moving ? Math.atan2(rp.targetY - rp.y, rp.targetX - rp.x) : 0;
        drawAvatar(rp.x, rp.y, colour, ini, displayName, false, angle, moving, speakingUserIdsRef.current.has(id), meetingActionsRef.current[id]);
      });

      // ── 14. LOCAL PLAYER ────────────────────────────────────────────
      const selfIni = username.split(" ").map(p => p[0] || "").slice(0, 2).join("").toUpperCase() || "Y";
      drawAvatar(
        player.current.x,
        player.current.y,
        avatarColor || "#6350ff",
        selfIni,
        "You",
        true,
        playerFacing.current.angle,
        playerFacing.current.moving,
        speakingUserIdsRef.current.has(socket.id),
        meetingActionsRef.current[socket.id]
      );

      ctx.restore();
      rawCtx.restore();
      rafId = requestAnimationFrame(gameLoop);
    }

    rafId = requestAnimationFrame(gameLoop);

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeCanvas);
      window.clearInterval(speakingPollTimer);
      window.clearInterval(positionDisplayTimer);
      speakingUserIdsRef.current = new Set();
      speakingLastHeard.clear();
      onSpeakingUsersChangeRef.current([]);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      canvas.removeEventListener("click", onCanvasClick);

      Object.values(peerConnections).forEach((pc) => {
        try { pc.close(); } catch (err) { console.debug("[WebRTC] PC close note:", err); }
      });
      peerConnectionsRef.current = {};
      pendingCandidatesRef.current = {};

      document.querySelectorAll('audio[id^="audio-"]').forEach((el) => {
        try {
          el.pause();
          el.srcObject = null;
          el.remove();
        } catch (err) { console.debug("[WebRTC] Audio cleanup note:", err); }
      });

      onSocketReady(null);
      renegotiatePeersRef.current = null;
      socket.disconnect();
    };
  }, [username]);

  return (
    <div className="office-canvas-container" ref={viewportRef}>
      <canvas
        ref={canvasRef}
        style={{
          border: "2px solid #334155",
          borderRadius: "8px",
          display: "block",
          cursor: "crosshair",
          maxWidth: "100%",
        }}
      />
      <div className="map-controls" role="group" aria-label="Map controls">
        <button type="button" onClick={() => setZoom((current) => Math.min(1.6, Math.round((current + 0.1) * 10) / 10))} aria-label="Zoom in">+</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((current) => Math.max(0.7, Math.round((current - 0.1) * 10) / 10))} aria-label="Zoom out">−</button>
        <button type="button" className={gridVisible ? "selected" : ""} onClick={() => setGridVisible((visible) => !visible)} aria-pressed={gridVisible} aria-label={gridVisible ? "Hide map grid" : "Show map grid"}>▦</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Reset map zoom">↺</button>
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>{fullscreen ? "⤢" : "⛶"}</button>
      </div>
      <div className="movement-hints" aria-label="Movement controls">
        <kbd>W A S D</kbd>
        <span>or arrow keys to move</span>
        <span>Click office to move</span>
        <span className="movement-position">
          Position: {positionDisplay.x}, {positionDisplay.y}
        </span>
      </div>
    </div>
  );
}

export default VirtualOffice;
