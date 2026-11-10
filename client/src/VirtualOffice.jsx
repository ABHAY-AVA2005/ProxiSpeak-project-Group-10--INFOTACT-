import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const serverPort = new URLSearchParams(window.location.search).get("server");

const SERVER_URL =
  serverPort === "5001"
    ? "http://localhost:5001"
    : import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

// ─── World constants (match server WORLD_BOUNDS) ─────────────────────────────
const WORLD_W = 1000;
const WORLD_H = 600;
const GRID_SIZE = 20;
const AVATAR_RADIUS = 18;
const PATH_STEP = 18;

// ─── Wall / obstacle definitions ─────────────────────────────────────────────
// Each rect: { x, y, width, height, label? }
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

const WALLS = [
  // Outer boundary walls (inset 10px)
  { x: 10, y: 10, width: WORLD_W - 20, height: 6, label: null },
  { x: 10, y: WORLD_H - 16, width: WORLD_W - 20, height: 6, label: null },
  { x: 10, y: 10, width: 6, height: WORLD_H - 20, label: null },
  { x: WORLD_W - 16, y: 10, width: 6, height: WORLD_H - 20, label: null },
];

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

// Solid obstacles that avatars navigate around
// Note: We use compact collision bounds so avatars can walk around furniture, sit at desks, and NEVER get trapped inside
const OBSTACLES = [
  // Meeting room conference table: table is drawn at (52, 68, 205, 82)
  // Collision box only occupies the central core (70, 76, 168, 66) so avatars can walk around it freely
  { x: 70, y: 76, width: 168, height: 66, label: "Table" },
  // Open workspace desks (compact collision box)
  { x: 335, y: 225, width: 70, height: 35, label: "Desk" },
  { x: 440, y: 225, width: 70, height: 35, label: "Desk" },
  { x: 545, y: 225, width: 70, height: 35, label: "Desk" },
  { x: 335, y: 320, width: 70, height: 35, label: "Desk" },
  { x: 440, y: 320, width: 70, height: 35, label: "Desk" },
  { x: 545, y: 320, width: 70, height: 35, label: "Desk" },
  // Lounge sofa
  { x: 45, y: 445, width: 105, height: 45, label: "Sofa" },
  // Pantry counter
  { x: 710, y: 425, width: 250, height: 30, label: "Counter" },
];

// Combined for collision
const ALL_SOLID = [...WALLS, ...ROOM_BOUNDARIES, ...OBSTACLES];

function checkCollision(cx, cy, radius = AVATAR_RADIUS) {
  for (const rect of ALL_SOLID) {
    const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    if ((cx - nearX) ** 2 + (cy - nearY) ** 2 < radius * radius) return true;
  }
  return false;
}

// Find nearest collision-free point in 16 radial directions
function findNearestFreePoint(x, y, radius = AVATAR_RADIUS - 4) {
  if (!checkCollision(x, y, radius)) return { x, y };
  for (let r = 2; r <= 40; r += 2) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const tx = Math.max(25, Math.min(WORLD_W - 25, x + Math.cos(a) * r));
      const ty = Math.max(25, Math.min(WORLD_H - 25, y + Math.sin(a) * r));
      if (!checkCollision(tx, ty, radius)) {
        return { x: tx, y: ty };
      }
    }
  }
  return { x, y };
}

function pointToCell(x, y) {
  return {
    x: Math.max(0, Math.min(Math.floor(x / GRID_SIZE), Math.ceil(WORLD_W / GRID_SIZE) - 1)),
    y: Math.max(0, Math.min(Math.floor(y / GRID_SIZE), Math.ceil(WORLD_H / GRID_SIZE) - 1)),
  };
}

function cellToPoint(cell) {
  return {
    x: cell.x * GRID_SIZE + GRID_SIZE / 2,
    y: cell.y * GRID_SIZE + GRID_SIZE / 2,
  };
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

function isCellBlocked(cellX, cellY) {
  if (cellX < 0 || cellY < 0 || cellX >= Math.ceil(WORLD_W / GRID_SIZE) || cellY >= Math.ceil(WORLD_H / GRID_SIZE)) {
    return true;
  }

  const pointX = cellX * GRID_SIZE + GRID_SIZE / 2;
  const pointY = cellY * GRID_SIZE + GRID_SIZE / 2;
  return checkCollision(pointX, pointY, AVATAR_RADIUS - 4);
}

function findPath(start, goal) {
  let startCell = pointToCell(start.x, start.y);
  let goalCell = pointToCell(goal.x, goal.y);

  // If start is in or near a blocked cell, find closest free cell near start
  if (isCellBlocked(startCell.x, startCell.y)) {
    let foundStart = null;
    for (let r = 1; r <= 4; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const testX = startCell.x + dx;
          const testY = startCell.y + dy;
          if (!isCellBlocked(testX, testY)) {
            foundStart = { x: testX, y: testY };
            break;
          }
        }
        if (foundStart) break;
      }
      if (foundStart) break;
    }
    if (foundStart) startCell = foundStart;
  }

  // If goal is slightly blocked, find closest free cell near goal
  if (isCellBlocked(goalCell.x, goalCell.y)) {
    let foundGoal = null;
    for (let r = 1; r <= 4; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const testX = goalCell.x + dx;
          const testY = goalCell.y + dy;
          if (!isCellBlocked(testX, testY)) {
            foundGoal = { x: testX, y: testY };
            break;
          }
        }
        if (foundGoal) break;
      }
      if (foundGoal) break;
    }
    if (foundGoal) goalCell = foundGoal;
    else return [{ x: goal.x, y: goal.y }];
  }

  const openSet = new Set([`${startCell.x},${startCell.y}`]);
  const cameFrom = new Map();
  const gScore = new Map([[`${startCell.x},${startCell.y}`, 0]]);
  const fScore = new Map([[`${startCell.x},${startCell.y}`, Math.abs(startCell.x - goalCell.x) + Math.abs(startCell.y - goalCell.y)]]);

  while (openSet.size > 0) {
    let currentKey = null;
    let currentScore = Infinity;
    for (const key of openSet) {
      const score = fScore.get(key) ?? Infinity;
      if (score < currentScore) {
        currentScore = score;
        currentKey = key;
      }
    }

    if (!currentKey) break;
    const [cx, cy] = currentKey.split(",").map(Number);
    if (cx === goalCell.x && cy === goalCell.y) {
      const path = [{ x: goal.x, y: goal.y }];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor);
        const [px, py] = cursor.split(",").map(Number);
        path.unshift(cellToPoint({ x: px, y: py }));
      }
      if (path.length > 1 && Math.hypot(path[0].x - start.x, path[0].y - start.y) < 14) {
        path.shift();
      }
      return path;
    }

    openSet.delete(currentKey);
    const neighbors = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
      [-1, -1], [-1, 1], [1, -1], [1, 1],
    ];

    for (const [dx, dy] of neighbors) {
      const nextX = cx + dx;
      const nextY = cy + dy;
      if (nextX < 0 || nextY < 0 || nextX >= Math.ceil(WORLD_W / GRID_SIZE) || nextY >= Math.ceil(WORLD_H / GRID_SIZE)) {
        continue;
      }
      if (isCellBlocked(nextX, nextY)) continue;

      const nextKey = `${nextX},${nextY}`;
      const tentative = (gScore.get(currentKey) ?? Infinity) + (dx === 0 || dy === 0 ? 1 : 1.4);
      if (tentative < (gScore.get(nextKey) ?? Infinity)) {
        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentative);
        const heuristic = Math.abs(nextX - goalCell.x) + Math.abs(nextY - goalCell.y);
        fScore.set(nextKey, tentative + heuristic);
        openSet.add(nextKey);
      }
    }
  }

  return [];
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
  onChatMessage = () => {},
  onSocketReady = () => {},
  meetingRooms = [],
  spawnRoom = "Open Work",
  avatarColor = "#2563eb",
}) {
  const canvasRef = useRef(null);
  const earshotRef = useRef(earshotRadius);
  const localStreamRef = useRef(localStream);
  const peerConnectionsRef = useRef({});
  const pendingCandidatesRef = useRef({});
  const routeRef = useRef([]);
  const clickTargetRef = useRef(null);
  const stuckFramesRef = useRef(0);
  const lastPosRef = useRef({ x: 160, y: 44 });
  const repathCooldownRef = useRef(0);
  const playerFacing = useRef({ angle: 0, moving: false });

  useEffect(() => { earshotRef.current = earshotRadius; }, [earshotRadius]);

  const player = useRef({ x: 160, y: 44, username });
  const keys = useRef({});
  const clickTarget = useRef(null);    // { x, y } for click-to-move
  const remotePlayers = useRef({});    // id -> { x, y, targetX, targetY, username }

  useEffect(() => {
    player.current.username = username;
  }, [username]);

  useEffect(() => {
    if (!meetingRooms.length) return;
    const targetRoom = meetingRooms.find((room) => room.name === spawnRoom || room.id === spawnRoom);
    if (targetRoom) {
      // If spawning in Meeting Room, place avatar in the open walkway above the table
      if (targetRoom.id === "Meeting Room" || targetRoom.name === "Meeting Room") {
        player.current.x = 160;
        player.current.y = 44;
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
      // Default spawn inside Meeting Room
      player.current.x = 160;
      player.current.y = 44;
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
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;

    // ── Socket.IO ──────────────────────────────────────────────────────────
    const socket = io(SERVER_URL, { transports: ["websocket"], reconnectionAttempts: 5 });

    const notifyPresence = () => {
      const entries = Object.entries(remotePlayers.current).map(([id, user]) => ({
        socketId: id,
        username: user.username || "Guest",
        status: "In office",
      }));

      onUsersChange([
        { socketId: socket.id || "local-user", username, status: "In office", isSelf: true },
        ...entries,
      ]);
    };

    socket.on("connect", () => {
      console.log("[ProxiSpeak] Connected:", socket.id);
      socket.emit("join", { username, x: player.current.x, y: player.current.y });
      notifyPresence();
      onSocketReady(socket);
    });

    socket.on("chat:message", (msg) => {
      onChatMessage(msg);
    });

    socket.on("users:list", (list) => {
      remotePlayers.current = {};
      (Array.isArray(list) ? list : Object.values(list || {})).forEach((u) => {
        const id = u.socketId || u.id;
        if (id && id !== socket.id) {
          remotePlayers.current[id] = { x: u.x, y: u.y, targetX: u.x, targetY: u.y, username: u.username };
        }
      });
      notifyPresence();
    });

    socket.on("user:joined", (u) => {
      const id = u.socketId || u.id;
      if (id && id !== socket.id) {
        remotePlayers.current[id] = { x: u.x, y: u.y, targetX: u.x, targetY: u.y, username: u.username };
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
      audioEl.volume = Math.max(0.01, gain); // Ensure volume is greater than 0

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
        console.log(`[WebRTC] Received audio stream ontrack from: ${peerId}`);
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : null;
        setupRemoteAudio(peerId, event.track, stream);
      };

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
        audioEl.volume = gain;
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
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("webrtc:offer", { targetId: peerId, offer });
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
      const scaleX = WORLD_W / rect.width;
      const scaleY = WORLD_H / rect.height;
      let tx = Math.round((e.clientX - rect.left) * scaleX);
      let ty = Math.round((e.clientY - rect.top) * scaleY);
      tx = Math.max(25, Math.min(WORLD_W - 25, tx));
      ty = Math.max(25, Math.min(WORLD_H - 25, ty));
      const target = { x: tx, y: ty };

      // If clicked point is inside an obstacle, find nearest unblocked spot nearby
      if (checkCollision(tx, ty, AVATAR_RADIUS)) {
        let foundSpot = null;
        for (let r = 10; r <= 80; r += 10) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            const testX = Math.round(tx + Math.cos(a) * r);
            const testY = Math.round(ty + Math.sin(a) * r);
            if (!checkCollision(testX, testY, AVATAR_RADIUS + 4)) {
              foundSpot = { x: testX, y: testY };
              break;
            }
          }
          if (foundSpot) break;
        }
        if (foundSpot) {
          target.x = foundSpot.x;
          target.y = foundSpot.y;
        }
      }

      const path = findPath({ x: player.current.x, y: player.current.y }, target);
      if (path && path.length > 0) {
        routeRef.current = path;
        clickTargetRef.current = target;
        clickTarget.current = target;
      } else {
        routeRef.current = [{ x: target.x, y: target.y }];
        clickTargetRef.current = target;
        clickTarget.current = target;
      }
    };
    canvas.addEventListener("click", onCanvasClick);

    // ── Game loop ──────────────────────────────────────────────────────────
    let rafId;
    let isRunning = true;
    let lastEmitTime = 0;
    let lastSentX = player.current.x;
    let lastSentY = player.current.y;
    const SPEED = 3;
    const LERP = 0.2;
    const CLICK_SPEED = 3;

    function gameLoop() {
      if (!isRunning) return;

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

        if (dist <= PATH_STEP) {
          routeRef.current.shift();
          if (routeRef.current.length === 0) {
            clickTarget.current = null;
          }
        } else {
          dx = (tdx / dist) * CLICK_SPEED;
          dy = (tdy / dist) * CLICK_SPEED;
        }
      }

      // Click-to-move fallback when no path route is available
      if (dx === 0 && dy === 0 && clickTarget.current) {
        const tdx = clickTarget.current.x - player.current.x;
        const tdy = clickTarget.current.y - player.current.y;
        const dist = Math.hypot(tdx, tdy);
        if (dist < CLICK_SPEED) {
          player.current.x = clickTarget.current.x;
          player.current.y = clickTarget.current.y;
          clickTarget.current = null;
          clickTargetRef.current = null;
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

      let movedX = false;
      let movedY = false;

      // Unstuck emergency escape: If player starts or grazes inside an obstacle/wall, smoothly nudge into nearest free space
      if (checkCollision(player.current.x, player.current.y, AVATAR_RADIUS - 4)) {
        const freePoint = findNearestFreePoint(player.current.x, player.current.y, AVATAR_RADIUS - 4);
        player.current.x = freePoint.x;
        player.current.y = freePoint.y;
      }

      if (dx !== 0) {
        const nx = Math.max(25, Math.min(WORLD_W - 25, player.current.x + dx));
        if (!checkCollision(nx, player.current.y, AVATAR_RADIUS - 4)) {
          player.current.x = nx;
          movedX = true;
        }
      }
      if (dy !== 0) {
        const ny = Math.max(25, Math.min(WORLD_H - 25, player.current.y + dy));
        if (!checkCollision(player.current.x, ny, AVATAR_RADIUS - 4)) {
          player.current.y = ny;
          movedY = true;
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
        const nudged = findNearestFreePoint(player.current.x, player.current.y, AVATAR_RADIUS - 3);
        player.current.x = nudged.x;
        player.current.y = nudged.y;

        const target = clickTargetRef.current;
        if (target) {
          // 2. Rebuild the A* path dynamically to the destination
          let newPath = findPath({ x: player.current.x, y: player.current.y }, target);

          // 3. If direct path is not immediately found, probe 8 surrounding neighbor cells for an open route
          if (!newPath || newPath.length === 0) {
            const probeOffsets = [
              [0, -18], [0, 18], [-18, 0], [18, 0],
              [-18, -18], [18, -18], [-18, 18], [18, 18]
            ];
            for (const [ox, oy] of probeOffsets) {
              const probeX = Math.max(25, Math.min(WORLD_W - 25, player.current.x + ox));
              const probeY = Math.max(25, Math.min(WORLD_H - 25, player.current.y + oy));
              if (!checkCollision(probeX, probeY, AVATAR_RADIUS - 4)) {
                const altPath = findPath({ x: probeX, y: probeY }, target);
                if (altPath && altPath.length > 0) {
                  newPath = [{ x: probeX, y: probeY }, ...altPath];
                  break;
                }
              }
            }
          }

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
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);

      // ── HELPER: draw rounded rect path ──────────────────────────────
      const rr = (rx, ry, rw, rh, rad) => { drawRoundedRect(ctx, rx, ry, rw, rh, rad); };

      // ── 1. FLOOR BACKGROUND ──────────────────────────────────────────
      const bgGrad = ctx.createLinearGradient(0, 0, WORLD_W, WORLD_H);
      bgGrad.addColorStop(0, "#ede9f6");
      bgGrad.addColorStop(1, "#e0dbf0");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      // Subtle floor texture dots
      ctx.fillStyle = "rgba(140,120,200,0.055)";
      for (let gx = 30; gx < WORLD_W; gx += 30) {
        for (let gy = 30; gy < WORLD_H; gy += 30) {
          ctx.beginPath(); ctx.arc(gx, gy, 1.5, 0, Math.PI * 2); ctx.fill();
        }
      }

      // ── 2. ROOM ZONES (no overlap) ───────────────────────────────────
      const drawRoom = (rx, ry, rw, rh, label, fillColor) => {
        ctx.save();
        rr(rx, ry, rw, rh, 16);
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
      // Center open workspace 320..680 x 210..385 (no overlap with rooms)
      drawRoom(18, 18, 285, 185, "Meeting Room", "rgba(228,224,248,0.88)");
      drawRoom(697, 18, 285, 185, "Focus Zone",   "rgba(220,232,248,0.88)");
      drawRoom(312, 195, 376, 190, "Open Workspace", "rgba(240,238,252,0.65)");
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
      rr(52, 68, 205, 82, 10);
      ctx.fillStyle = "#c8b98a"; ctx.fill();
      ctx.strokeStyle = "#a89060"; ctx.lineWidth = 1.5; ctx.stroke();
      // Chairs top
      for (let i = 0; i < 4; i++) { rr(64 + i * 48, 54, 28, 12, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill(); }
      // Chairs bottom
      for (let i = 0; i < 4; i++) { rr(64 + i * 48, 150, 28, 12, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill(); }
      // Chairs sides
      rr(34, 95, 12, 28, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      rr(262, 95, 12, 28, 4); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      // Plant TL corner
      ctx.beginPath(); ctx.arc(40, 172, 13, 0, Math.PI*2); ctx.fillStyle = "#4a9e4a"; ctx.fill();
      ctx.beginPath(); ctx.arc(40, 172, 7, 0, Math.PI*2); ctx.fillStyle = "#3a7e3a"; ctx.fill();
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
      ctx.beginPath(); ctx.arc(958, 168, 14, 0, Math.PI*2); ctx.fillStyle = "#4a9e4a"; ctx.fill();
      ctx.beginPath(); ctx.arc(958, 168, 8, 0, Math.PI*2); ctx.fillStyle = "#3a7e3a"; ctx.fill();
      ctx.restore();

      // ── 6. OPEN WORKSPACE DESKS (CENTER AREA) ───────────────────────
      ctx.save();
      // 2 rows × 3 desks, well inside 320..680 x 210..385
      const deskPos = [
        {x:325,y:220},{x:430,y:220},{x:535,y:220},
        {x:325,y:315},{x:430,y:315},{x:535,y:315},
      ];
      deskPos.forEach((dp, idx) => {
        rr(dp.x, dp.y, 85, 46, 6); ctx.fillStyle = "#c8b98a"; ctx.fill();
        ctx.strokeStyle = "#a89060"; ctx.lineWidth = 1; ctx.stroke();
        rr(dp.x+22, dp.y+6, 40, 26, 3); ctx.fillStyle = "#1e1e34"; ctx.fill();
        rr(dp.x+24, dp.y+8, 36, 22, 2); ctx.fillStyle = idx%2===0?"#2d3a7a":"#1a3050"; ctx.fill();
        rr(dp.x+24, dp.y+52, 36, 14, 5); ctx.fillStyle = "#3a3a5a"; ctx.fill();
      });
      // Plants in open area
      [[312,390],[676,220],[676,390]].forEach(([px,py]) => {
        ctx.beginPath(); ctx.arc(px,py,13,0,Math.PI*2); ctx.fillStyle="#4a9e4a"; ctx.fill();
        ctx.beginPath(); ctx.arc(px,py,7,0,Math.PI*2); ctx.fillStyle="#3a7e3a"; ctx.fill();
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
      ctx.beginPath(); ctx.arc(255,420,15,0,Math.PI*2); ctx.fillStyle="#4a9e4a"; ctx.fill();
      ctx.beginPath(); ctx.arc(255,420,9,0,Math.PI*2); ctx.fillStyle="#3a7e3a"; ctx.fill();
      ctx.beginPath(); ctx.arc(42,565,12,0,Math.PI*2); ctx.fillStyle="#4a9e4a"; ctx.fill();
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
      ctx.beginPath(); ctx.arc(958, 572, 13, 0, Math.PI*2); ctx.fillStyle="#4a9e4a"; ctx.fill();
      ctx.beginPath(); ctx.arc(958, 572, 7, 0, Math.PI*2); ctx.fillStyle="#3a7e3a"; ctx.fill();
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

      // Suppress old room layout variable (not used anymore)
      const roomLayout = [];

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
      const drawAvatar = (ax, ay, color, initials, name, isLocal, facingAngle = 0, isMoving = false) => {
        const R = AVATAR_RADIUS;
        // Glow ring for local user
        if (isLocal) {
          ctx.save();
          ctx.shadowBlur = 20; ctx.shadowColor = "rgba(99,102,241,0.9)";
          ctx.beginPath(); ctx.arc(ax, ay, R + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(140,120,255,0.75)"; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.restore();
        }

        // Direction pointer / visor indicator when moving or facing
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(facingAngle);
        // Small directional arrowhead / pointer on avatar rim
        ctx.beginPath();
        ctx.moveTo(R + 5, 0);
        ctx.lineTo(R - 2, -4);
        ctx.lineTo(R - 2, 4);
        ctx.closePath();
        ctx.fillStyle = isLocal ? "#6350ff" : "#4ade80";
        ctx.fill();
        ctx.restore();

        // Walking wobble bounce when moving
        const bounce = isMoving ? Math.sin(performance.now() / 100) * 1.5 : 0;

        // Avatar fill
        ctx.save();
        ctx.beginPath(); ctx.arc(ax, ay + bounce, R, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();

        // Green online dot
        ctx.save();
        ctx.beginPath(); ctx.arc(ax + R * 0.65, ay + R * 0.65 + bounce, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#2bd67b"; ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();

        // Initials
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "center"; ctx.fillText(initials, ax, ay + 4 + bounce);

        // Name pill below
        ctx.save();
        const nameW = ctx.measureText(name).width + 14;
        rr(ax - nameW / 2, ay + R + 6, nameW, 17, 8);
        ctx.fillStyle = "rgba(18,16,46,0.65)"; ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 10px Inter, sans-serif";
        ctx.textAlign = "center"; ctx.fillText(name, ax, ay + R + 17);
        ctx.restore();
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
        drawAvatar(rp.x, rp.y, colour, ini, displayName, false, angle, moving);
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
        playerFacing.current.moving
      );

      rafId = requestAnimationFrame(gameLoop);
    }

    rafId = requestAnimationFrame(gameLoop);

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
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
      socket.disconnect();
    };
  }, [username]);

  return (
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
  );
}

export default VirtualOffice;
