import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

const WORLD_W = 1000;
const WORLD_H = 600;
const GRID_SIZE = 40;
const AVATAR_RADIUS = 18;

const WALLS = [
  { x: 10, y: 10, width: WORLD_W - 20, height: 6, label: null },
  { x: 10, y: WORLD_H - 16, width: WORLD_W - 20, height: 6, label: null },
  { x: 10, y: 10, width: 6, height: WORLD_H - 20, label: null },
  { x: WORLD_W - 16, y: 10, width: 6, height: WORLD_H - 20, label: null },
  { x: 500, y: 80, width: 300, height: 6, label: null },
  { x: 500, y: 80, width: 6, height: 220, label: null },
  { x: 794, y: 80, width: 6, height: 220, label: null },
  { x: 500, y: 294, width: 110, height: 6, label: null },
  { x: 690, y: 294, width: 110, height: 6, label: null },
];

const OBSTACLES = [
  { x: 150, y: 150, width: 180, height: 70, label: "Desk" },
  { x: 380, y: 420, width: 160, height: 70, label: "Desk" },
  { x: 560, y: 120, width: 220, height: 60, label: "Table" },
];
const ALL_SOLID = [...WALLS, ...OBSTACLES];

function checkCollision(cx, cy, radius = AVATAR_RADIUS) {
  for (const rect of ALL_SOLID) {
    const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
    const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
    if ((cx - nearX) ** 2 + (cy - nearY) ** 2 < radius * radius) return true;
  }
  return false;
}

const REMOTE_COLOURS = ["#f97316", "#a855f7", "#ec4899", "#14b8a6", "#f59e0b", "#64748b", "#06b6d4", "#84cc16"];
const colourCache = {};
function colourForId(id) {
  if (!colourCache[id]) {
    colourCache[id] = REMOTE_COLOURS[Object.keys(colourCache).length % REMOTE_COLOURS.length];
  }
  return colourCache[id];
}

function drawDesk(ctx, x, y, w = 90, h = 48, tone = "#d2b48a") {
  ctx.fillStyle = "rgba(24, 33, 29, 0.08)";
  ctx.fillRect(x + 8, y + h + 8, w, 10);
  ctx.fillStyle = tone;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "rgba(102, 74, 48, 0.25)";
  ctx.fillRect(x + 8, y + 8, w - 16, 8);
  ctx.fillStyle = "rgba(96, 70, 48, 0.22)";
  ctx.fillRect(x + 10, y + h - 8, w - 20, 8);
}

function drawPlant(ctx, x, y) {
  ctx.fillStyle = "#73ac88";
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4d7a5d";
  ctx.fillRect(x - 2, y + 12, 4, 12);
  ctx.fillStyle = "#5f8c63";
  for (let i = 0; i < 5; i++) {
    const ox = x + (i - 2) * 7;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.quadraticCurveTo(ox, y - 12, ox, y + 12);
    ctx.strokeStyle = "#91c29d";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawAvatar(ctx, x, y, { name, colour, isLocal, inEarshot }) {
  const skin = isLocal ? "#f3d0b5" : "#ebc9a7";
  const shirt = isLocal ? "#2469d6" : colour;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(16, 22, 18, 0.18)";
  ctx.beginPath();
  ctx.ellipse(0, 22, 18, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -10, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shirt;
  ctx.fillRect(-12, 2, 24, 18);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(-7, 5, 14, 6);

  ctx.strokeStyle = isLocal ? "#9ec5ff" : inEarshot ? "#d5f2d8" : "#6d7373";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, 20);
  ctx.lineTo(-6, 30);
  ctx.moveTo(8, 20);
  ctx.lineTo(6, 30);
  ctx.moveTo(-5, 20);
  ctx.lineTo(-9, 30);
  ctx.moveTo(5, 20);
  ctx.lineTo(9, 30);
  ctx.stroke();

  ctx.restore();

  ctx.fillStyle = inEarshot ? "#244d43" : "#4b5b59";
  ctx.font = "600 11px Inter, Arial";
  ctx.textAlign = "center";
  ctx.fillText(name || "You", x, y - 26);

  if (inEarshot && !isLocal) {
    ctx.fillStyle = "rgba(27, 148, 96, 0.9)";
    ctx.fillRect(x - 18, y + 26, 36, 10);
    ctx.fillStyle = "#fff";
    ctx.font = "700 8px Inter, Arial";
    ctx.fillText("LIVE", x, y + 34);
  }
}

function VirtualOffice({ username = "You", earshotRadius = 100, localStream = null }) {
  const canvasRef = useRef(null);
  const earshotRef = useRef(earshotRadius);
  const localStreamRef = useRef(localStream);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { earshotRef.current = earshotRadius; }, [earshotRadius]);

  const player = useRef({ x: 400, y: 400, username });
  const keys = useRef({});
  const clickTarget = useRef(null);
  const remotePlayers = useRef({});

  useEffect(() => {
    player.current.username = username;
  }, [username]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;

    const socket = io(SERVER_URL, { transports: ["websocket"], reconnectionAttempts: 5 });

    socket.on("connect", () => {
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

    const peerConnections = {};
    const audioNodes = {};

    function getOrCreatePC(peerId) {
      if (peerConnections[peerId]) return peerConnections[peerId];

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

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
        audioEl.play().catch(() => {});

        try {
          if (!window._proxAudioCtx) {
            window._proxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          }
          const ctxAudio = window._proxAudioCtx;
          if (ctxAudio.state === "suspended") ctxAudio.resume();
          if (!audioNodes[peerId]) {
            const source = ctxAudio.createMediaStreamSource(stream);
            const gainNode = ctxAudio.createGain();
            const pannerNode = ctxAudio.createStereoPanner ? ctxAudio.createStereoPanner() : null;

            if (pannerNode) {
              source.connect(gainNode);
              gainNode.connect(pannerNode);
              pannerNode.connect(ctxAudio.destination);
            } else {
              source.connect(gainNode);
              gainNode.connect(ctxAudio.destination);
            }
            audioNodes[peerId] = { source, gainNode, pannerNode };
            audioEl.muted = true;
          }
        } catch (e) {
          console.warn("[WebAudio] Spatial mixer fallback to HTML audio:", e);
        }
      };

      peerConnections[peerId] = pc;
      return pc;
    }

    function updateAudioSpatialMixer() {
      if (!window._proxAudioCtx || !Object.keys(audioNodes).length) return;
      const myX = player.current.x;
      const myY = player.current.y;
      Object.entries(audioNodes).forEach(([peerId, nodes]) => {
        const peer = remotePlayers.current[peerId];
        if (!peer || !nodes.gainNode) return;
        const dist = Math.hypot(peer.x - myX, peer.y - myY);
        const gain = Math.max(0, Math.min(1, 1 - dist / earshotRef.current));
        nodes.gainNode.gain.setValueAtTime(gain, window._proxAudioCtx.currentTime);
        if (nodes.pannerNode) {
          const pan = Math.max(-1, Math.min(1, (peer.x - myX) / earshotRef.current));
          nodes.pannerNode.pan.setValueAtTime(pan, window._proxAudioCtx.currentTime);
        }
      });
    }

    socket.on("nearby:enter", async ({ socketId, id, shouldInitiateOffer }) => {
      const peerId = socketId || id;
      if (!peerId) return;

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
      if (!peerId) return;
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

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        e.preventDefault();
        clickTarget.current = null;
      }
      keys.current[k] = true;
    };
    const onKeyUp = (e) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

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

      let dx = 0;
      let dy = 0;
      const k = keys.current;

      if (k["arrowup"] || k["w"]) dy -= SPEED;
      if (k["arrowdown"] || k["s"]) dy += SPEED;
      if (k["arrowleft"] || k["a"]) dx -= SPEED;
      if (k["arrowright"] || k["d"]) dx += SPEED;

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

      const now = performance.now();
      if ((player.current.x !== lastSentX || player.current.y !== lastSentY) && now - lastEmitTime >= 33) {
        lastSentX = player.current.x;
        lastSentY = player.current.y;
        lastEmitTime = now;
        socket.emit("move", { x: player.current.x, y: player.current.y });
      }

      Object.values(remotePlayers.current).forEach((rp) => {
        rp.x += (rp.targetX - rp.x) * LERP;
        rp.y += (rp.targetY - rp.y) * LERP;
        if (Math.abs(rp.targetX - rp.x) < 0.1) rp.x = rp.targetX;
        if (Math.abs(rp.targetY - rp.y) < 0.1) rp.y = rp.targetY;
      });

      updateAudioSpatialMixer();
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);

      const earshot = earshotRef.current;
      const background = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      background.addColorStop(0, "#f2f0ea");
      background.addColorStop(1, "#e8e2d7");
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.strokeStyle = "rgba(92, 102, 96, 0.08)";
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= WORLD_W; gx += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, WORLD_H); ctx.stroke();
      }
      for (let gy = 0; gy <= WORLD_H; gy += GRID_SIZE) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(WORLD_W, gy); ctx.stroke();
      }

      ctx.fillStyle = "rgba(192, 216, 198, 0.8)";
      ctx.fillRect(420, 80, 212, 208);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 2;
      ctx.strokeRect(420, 80, 212, 208);
      ctx.fillStyle = "#5f8572";
      ctx.font = "600 12px Inter, Arial";
      ctx.textAlign = "center";
      ctx.fillText("FOCUS ROOM", 526, 95);

      ctx.fillStyle = "rgba(214, 200, 173, 0.9)";
      ctx.fillRect(90, 360, 230, 130);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.strokeRect(90, 360, 230, 130);
      ctx.fillStyle = "#7a6a58";
      ctx.font = "600 12px Inter, Arial";
      ctx.fillText("LOUNGE", 205, 376);

      ctx.fillStyle = "#d7d0c0";
      ctx.fillRect(690, 360, 210, 120);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.strokeRect(690, 360, 210, 120);
      ctx.fillStyle = "#7b6e60";
      ctx.fillText("OPEN WORK", 795, 376);

      drawDesk(ctx, 130, 125, 92, 56, "#d9c5a1");
      drawDesk(ctx, 240, 125, 92, 56, "#d9c5a1");
      drawDesk(ctx, 130, 200, 92, 56, "#d9c5a1");
      drawDesk(ctx, 240, 200, 92, 56, "#d9c5a1");
      drawDesk(ctx, 680, 135, 110, 62, "#d5b58b");
      drawDesk(ctx, 805, 135, 110, 62, "#d5b58b");
      drawDesk(ctx, 680, 215, 110, 62, "#d5b58b");
      drawDesk(ctx, 805, 215, 110, 62, "#d5b58b");

      drawPlant(ctx, 360, 90);
      drawPlant(ctx, 845, 90);
      drawPlant(ctx, 100, 500);
      drawPlant(ctx, 850, 500);

      const wallPalette = ["#eae4d9", "#dfe6d3", "#d3d5c6"];
      WALLS.forEach((w, i) => {
        ctx.fillStyle = wallPalette[i % wallPalette.length];
        ctx.fillRect(w.x, w.y, w.width, w.height);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(w.x, w.y, w.width, w.height);
      });

      ctx.strokeStyle = "rgba(100, 110, 108, 0.85)";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(610, 290);
      ctx.lineTo(690, 290);
      ctx.stroke();
      ctx.setLineDash([]);

      if (clickTarget.current) {
        ctx.beginPath();
        ctx.arc(clickTarget.current.x, clickTarget.current.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(25, 122, 108, 0.8)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(player.current.x, player.current.y, earshot, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(54, 110, 103, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(54, 110, 103, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);

      Object.entries(remotePlayers.current).forEach(([id, rp]) => {
        const dist = Math.hypot(rp.x - player.current.x, rp.y - player.current.y);
        const inEarshot = dist <= earshot;
        const colour = colourForId(id);
        drawAvatar(ctx, rp.x, rp.y, { name: rp.username || id.slice(0, 6), colour, isLocal: false, inEarshot });
      });

      drawAvatar(ctx, player.current.x, player.current.y, {
        name: username,
        colour: "#7f6fe9",
        isLocal: true,
        inEarshot: true
      });

      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255, 255, 255, 0.74)";
      ctx.fillRect(18, 14, 210, 56);
      ctx.strokeStyle = "rgba(94, 103, 98, 0.15)";
      ctx.strokeRect(18, 14, 210, 56);
      ctx.fillStyle = "#2a3d3c";
      ctx.font = "600 11px Inter, Arial";
      ctx.fillText(`?? ${username}`, 28, 34);
      ctx.fillText(`?? ${earshot}px earshot`, 28, 52);

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
        width: "100%",
        maxWidth: "100%",
        border: "1px solid rgba(0, 0, 0, 0.8)",
        borderRadius: "24px",
        display: "block",
        background: "#f1efe9",
        boxShadow: "0 24px 38px rgba(17, 24, 20, 0.08)",
        cursor: "crosshair",
      }}
    />
  );
}

export default VirtualOffice;
