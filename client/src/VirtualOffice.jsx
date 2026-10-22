import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

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

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { earshotRef.current = earshotRadius; }, [earshotRadius]);

  const player = useRef({ x: 400, y: 400, username });
  const keys = useRef({});
  const clickTarget = useRef(null);    // { x, y } for click-to-move
  const remotePlayers = useRef({});    // id -> { x, y, targetX, targetY, username }

  useEffect(() => {
    player.current.username = username;
  }, [username]);

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
      if (p) { p.targetX = data.x; p.targetY = data.y; }
      else remotePlayers.current[id] = { x: data.x, y: data.y, targetX: data.x, targetY: data.y, username: "" };
    });

    socket.on("user:left", (data) => {
      const id = data?.socketId || data?.id;
      if (id) {
        delete remotePlayers.current[id];
        delete colourCache[id];
        const audioEl = document.getElementById(`audio-${id}`);
        if (audioEl) audioEl.remove();
      }
    });

    // ── WebRTC Signaling & Spatial Audio Handshake ────────────────────────
    const peerConnections = {};

    function getOrCreatePC(peerId) {
      if (peerConnections[peerId]) return peerConnections[peerId];

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      // Send local audio track if mic is enabled
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { targetId: peerId, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        console.log("[WebRTC] Received audio stream from:", peerId);
        const stream = event.streams[0] || new MediaStream([event.track]);
        
        let audioEl = document.getElementById(`audio-${peerId}`);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.id = `audio-${peerId}`;
          audioEl.autoplay = true;
          audioEl.style.display = "none";
          document.body.appendChild(audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch((err) => console.log("Audio autoplay note:", err));

        // Setup Web Audio spatial nodes if AudioContext is supported
        try {
          if (!window._proxAudioCtx) {
            window._proxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          }
          const ctx = window._proxAudioCtx;
          if (ctx.state === "suspended") {
            ctx.resume();
          }
          if (!audioNodes[peerId]) {
            const source = ctx.createMediaStreamSource(stream);
            const gainNode = ctx.createGain();
            const pannerNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

            if (pannerNode) {
              source.connect(gainNode);
              gainNode.connect(pannerNode);
              pannerNode.connect(ctx.destination);
            } else {
              source.connect(gainNode);
              gainNode.connect(ctx.destination);
            }
            audioNodes[peerId] = { source, gainNode, pannerNode };
            audioEl.muted = true; // Output through AudioContext to prevent duplicate echo
          }
        } catch (e) {
          console.warn("[WebAudio] Spatial mixer fallback to HTML audio:", e);
        }
      };

      peerConnections[peerId] = pc;
      return pc;
    }

    const audioNodes = {};

    // Helper to dynamically update volume and panning as avatars move
    function updateAudioSpatialMixer() {
      const myX = player.current.x;
      const myY = player.current.y;

      Object.entries(audioNodes).forEach(([peerId, nodes]) => {
        const peer = remotePlayers.current[peerId];
        if (!peer || !nodes.gainNode) return;

        const dist = Math.hypot(peer.x - myX, peer.y - myY);
        const maxDist = earshotRef.current || 200;

        // Attenuation: 1 at 0 distance, 0 at maxDist
        const gain = Math.max(0, Math.min(1, 1 - dist / maxDist));
        nodes.gainNode.gain.setValueAtTime(gain, window._proxAudioCtx ? window._proxAudioCtx.currentTime : 0);

        // Stereo panning: -1 (left) to +1 (right)
        if (nodes.pannerNode) {
          const pan = Math.max(-1, Math.min(1, (peer.x - myX) / maxDist));
          nodes.pannerNode.pan.setValueAtTime(pan, window._proxAudioCtx ? window._proxAudioCtx.currentTime : 0);
        }
      });
    }

    // Update tracks on active peer connections when localStream changes
    if (localStreamRef.current) {
      Object.values(peerConnections).forEach((pc) => {
        localStreamRef.current.getTracks().forEach((track) => {
          const senders = pc.getSenders();
          const exists = senders.some((s) => s.track && s.track.id === track.id);
          if (!exists) {
            pc.addTrack(track, localStreamRef.current);
          }
        });
      });
    }

    socket.on("nearby:enter", async ({ socketId, id, shouldInitiateOffer }) => {
      const peerId = socketId || id;
      if (!peerId) return;
      console.log(`[ProxiSpeak] nearby:enter from ${peerId}, initiateOffer=${shouldInitiateOffer}`);
      const pc = getOrCreatePC(peerId);

      if (shouldInitiateOffer) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("webrtc:offer", { targetId: peerId, offer });
        } catch (err) {
          console.error("[WebRTC] Create offer error:", err);
        }
      }
    });

    socket.on("nearby:leave", ({ socketId, id }) => {
      const peerId = socketId || id;
      console.log(`[ProxiSpeak] nearby:leave from ${peerId}`);
      if (peerConnections[peerId]) {
        peerConnections[peerId].close();
        delete peerConnections[peerId];
      }
      if (audioNodes[peerId]) {
        try {
          audioNodes[peerId].source.disconnect();
          audioNodes[peerId].gainNode.disconnect();
          if (audioNodes[peerId].pannerNode) audioNodes[peerId].pannerNode.disconnect();
        } catch (_) {}
        delete audioNodes[peerId];
      }
      const audioEl = document.getElementById(`audio-${peerId}`);
      if (audioEl) audioEl.remove();
    });

    socket.on("webrtc:offer", async ({ senderId, offer }) => {
      console.log("[WebRTC] Received offer from:", senderId);
      const pc = getOrCreatePC(senderId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { targetId: senderId, answer });
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
        } catch (err) {
          console.error("[WebRTC] Error handling answer:", err);
        }
      }
    });

    socket.on("webrtc:ice-candidate", async ({ senderId, candidate }) => {
      const pc = peerConnections[senderId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("[WebRTC] Error adding ICE candidate:", err);
        }
      }
    });

    // ── Keyboard ───────────────────────────────────────────────────────────
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"].includes(k)) {
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
      if (k["arrowup"]    || k["w"]) dy -= SPEED;
      if (k["arrowdown"]  || k["s"]) dy += SPEED;
      if (k["arrowleft"]  || k["a"]) dx -= SPEED;
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

      // Update volume and panning in real time as players move
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
        ctx.fillStyle = "#fff";
        ctx.font = `bold 13px Inter, Arial`;
        ctx.textAlign = "center";
        ctx.fillText((rp.username || "?")[0].toUpperCase(), rp.x, rp.y + 5);

        // Username label above avatar
        ctx.fillStyle = inEarshot ? "#e5e7eb" : "#6b7280";
        ctx.font = "11px Inter, Arial";
        ctx.textAlign = "center";
        ctx.fillText(rp.username || id.slice(0, 6), rp.x, rp.y - AVATAR_RADIUS - 6);

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
      canvas.removeEventListener("click", onCanvasClick);
      socket.disconnect();
    };
  }, [username, localStream]);

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