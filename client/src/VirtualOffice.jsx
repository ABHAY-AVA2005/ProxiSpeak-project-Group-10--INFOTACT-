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
const GRID_SIZE = 40; // floor tile size in px
const AVATAR_RADIUS = 18;

// ─── Wall / obstacle definitions ─────────────────────────────────────────────
// Each rect: { x, y, width, height, label? }
const WALLS = [
  // Outer boundary walls (inset 10px)
  { x: 10, y: 10, width: WORLD_W - 20, height: 6, label: null },   // top
  { x: 10, y: WORLD_H - 16, width: WORLD_W - 20, height: 6, label: null }, // bottom
  { x: 10, y: 10, width: 6, height: WORLD_H - 20, label: null },  // left
  { x: WORLD_W - 16, y: 10, width: 6, height: WORLD_H - 20, label: null }, // right

  // Meeting room walls (with doorway gap on south side)
  { x: 500, y: 80, width: 300, height: 6, label: null },  // north
  { x: 500, y: 80, width: 6, height: 220, label: null },  // west
  { x: 794, y: 80, width: 6, height: 220, label: null },  // east
  { x: 500, y: 294, width: 110, height: 6, label: null }, // south-left
  { x: 690, y: 294, width: 110, height: 6, label: null }, // south-right
];

// Solid obstacles (desk, etc.)
const OBSTACLES = [
  { x: 150, y: 150, width: 180, height: 70, label: "Desk" },
  { x: 380, y: 420, width: 160, height: 70, label: "Desk" },
  { x: 560, y: 120, width: 220, height: 60, label: "Table" },
];

// Combined for collision
const ALL_SOLID = [...WALLS, ...OBSTACLES];

function checkCollision(cx, cy, radius = AVATAR_RADIUS) {
  for (const rect of ALL_SOLID) {
    const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    if ((cx - nearX) ** 2 + (cy - nearY) ** 2 < radius * radius) return true;
  }
  return false;
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
function VirtualOffice({ username = "You", earshotRadius = 100, localStream = null }) {
  const canvasRef = useRef(null);
  const earshotRef = useRef(earshotRadius);
  const localStreamRef = useRef(localStream);
  const peerConnectionsRef = useRef({});
  const pendingCandidatesRef = useRef({});

  useEffect(() => { earshotRef.current = earshotRadius; }, [earshotRadius]);

  const player = useRef({ x: 400, y: 400, username });
  const keys = useRef({});
  const clickTarget = useRef(null);    // { x, y } for click-to-move
  const remotePlayers = useRef({});    // id -> { x, y, targetX, targetY, username }

  useEffect(() => {
    player.current.username = username;
  }, [username]);

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

    socket.on("connect", () => {
      console.log("[ProxiSpeak] Connected:", socket.id);
      socket.emit("join", { username, x: player.current.x, y: player.current.y });
    });

    socket.on("users:list", (list) => {
      remotePlayers.current = {};
      (Array.isArray(list) ? list : Object.values(list || {})).forEach((u) => {
        const id = u.socketId || u.id;
        if (id && id !== socket.id) {
          remotePlayers.current[id] = { x: u.x, y: u.y, targetX: u.x, targetY: u.y, username: u.username };
        }
      });
    });

    socket.on("user:joined", (u) => {
      const id = u.socketId || u.id;
      if (id && id !== socket.id) {
        remotePlayers.current[id] = { x: u.x, y: u.y, targetX: u.x, targetY: u.y, username: u.username };
      }
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
      const tx = Math.round((e.clientX - rect.left) * scaleX);
      const ty = Math.round((e.clientY - rect.top) * scaleY);
      if (!checkCollision(tx, ty)) {
        clickTarget.current = { x: tx, y: ty };
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

      // Click-to-move (only when no key held)
      if (dx === 0 && dy === 0 && clickTarget.current) {
        const tdx = clickTarget.current.x - player.current.x;
        const tdy = clickTarget.current.y - player.current.y;
        const dist = Math.hypot(tdx, tdy);
        if (dist < CLICK_SPEED) {
          player.current.x = clickTarget.current.x;
          player.current.y = clickTarget.current.y;
          clickTarget.current = null;
        } else {
          dx = (tdx / dist) * CLICK_SPEED;
          dy = (tdy / dist) * CLICK_SPEED;
        }
      }

      if (dx !== 0) {
        const nx = Math.max(20, Math.min(WORLD_W - 20, player.current.x + dx));
        if (!checkCollision(nx, player.current.y)) player.current.x = nx;
        else clickTarget.current = null;
      }
      if (dy !== 0) {
        const ny = Math.max(20, Math.min(WORLD_H - 20, player.current.y + dy));
        if (!checkCollision(player.current.x, ny)) player.current.y = ny;
        else clickTarget.current = null;
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

      // 1. Floor grid (Tanvi Day 2)
      ctx.fillStyle = "#1e2533";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.strokeStyle = "rgba(255,255,255,0.045)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= WORLD_W; gx += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke();
      }
      for (let gy = 0; gy <= WORLD_H; gy += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); ctx.stroke();
      }

      // 2. Obstacle fills (Tanvi Day 6 — world obstacles)
      OBSTACLES.forEach((obs) => {
        ctx.fillStyle = "#4b3f2a";
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        ctx.strokeStyle = "#78604a";
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        if (obs.label) {
          ctx.fillStyle = "#d4b896";
          ctx.font = "bold 12px Inter, Arial";
          ctx.textAlign = "center";
          ctx.fillText(obs.label, obs.x + obs.width / 2, obs.y + obs.height / 2 + 5);
        }
      });

      // 3. Wall rectangles (Tanvi Day 6)
      ctx.fillStyle = "#334155";
      WALLS.forEach((w) => {
        ctx.fillRect(w.x, w.y, w.width, w.height);
      });

      // Meeting room label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px Inter, Arial";
      ctx.textAlign = "center";
      ctx.fillText("Meeting Room", 650, 105);

      // Doorway dashed threshold
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(610, 300); ctx.lineTo(690, 300); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px Inter, Arial";
      ctx.fillText("DOOR", 650, 316);

      // 4. Click-to-move target indicator
      if (clickTarget.current) {
        ctx.beginPath();
        ctx.arc(clickTarget.current.x, clickTarget.current.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(99,179,237,0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 5. Earshot circle (Tanvi Day 5 — visual feedback)
      const earshot = earshotRef.current;
      ctx.beginPath();
      ctx.arc(player.current.x, player.current.y, earshot, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59,130,246,0.06)";
      ctx.fill();
      ctx.strokeStyle = "rgba(59,130,246,0.3)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // 6. Remote avatars with username (Tanvi Day 3 + Day 5)
      Object.entries(remotePlayers.current).forEach(([id, rp]) => {
        const dist = Math.hypot(rp.x - player.current.x, rp.y - player.current.y);
        const inEarshot = dist <= earshot;
        const colour = colourForId(id);

        // Avatar circle
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = inEarshot ? colour : "rgba(100,100,100,0.4)";
        ctx.fill();
        ctx.strokeStyle = inEarshot ? "#fff" : "#555";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();

        // Earshot ring
        if (inEarshot) {
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, AVATAR_RADIUS + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(34,197,94,0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.closePath();
        }

        // Initial letter inside avatar
        const displayName = rp.username && rp.username.trim() ? rp.username : "?";
        ctx.fillStyle = "#fff";
        ctx.font = `bold 13px Inter, Arial`;
        ctx.textAlign = "center";
        ctx.fillText(displayName[0].toUpperCase(), rp.x, rp.y + 5);

        // Username label above avatar
        ctx.fillStyle = inEarshot ? "#e5e7eb" : "#6b7280";
        ctx.font = "11px Inter, Arial";
        ctx.textAlign = "center";
        ctx.fillText(displayName !== "?" ? displayName : id.slice(0, 6), rp.x, rp.y - AVATAR_RADIUS - 6);

        // Earshot distance badge
        if (inEarshot) {
          ctx.fillStyle = "rgba(34,197,94,0.85)";
          ctx.font = "9px Inter, Arial";
          ctx.fillText(`${Math.round(dist)}px`, rp.x, rp.y + AVATAR_RADIUS + 12);
        }
      });

      // 7. Local player avatar with username (Tanvi Day 3)
      ctx.beginPath();
      ctx.arc(player.current.x, player.current.y, AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "#2563eb";
      ctx.fill();
      ctx.strokeStyle = "#93c5fd";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.closePath();

      ctx.fillStyle = "#fff";
      ctx.font = `bold 13px Inter, Arial`;
      ctx.textAlign = "center";
      ctx.fillText((username[0] || "Y").toUpperCase(), player.current.x, player.current.y + 5);

      ctx.fillStyle = "#bfdbfe";
      ctx.font = "bold 11px Inter, Arial";
      ctx.textAlign = "center";
      ctx.fillText(username, player.current.x, player.current.y - AVATAR_RADIUS - 6);

      // 8. HUD overlay
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(14, 14, 210, 50);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "11px Inter, Arial";
      ctx.fillText(`👤 ${username}`, 22, 32);
      ctx.fillText(`📡 Earshot: ${earshot}px`, 22, 50);
      ctx.fillText(`🧑 Online: ${Object.keys(remotePlayers.current).length + 1}`, 130, 32);
      ctx.fillText(`📍 ${Math.round(player.current.x)}, ${Math.round(player.current.y)}`, 130, 50);

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
