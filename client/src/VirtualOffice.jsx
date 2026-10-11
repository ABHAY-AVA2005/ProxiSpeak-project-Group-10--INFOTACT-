import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

// Office obstacles for collision detection
const OBSTACLES = [
    // Desk (solid obstacle)
    { x: 150, y: 150, width: 180, height: 80 },
    // Meeting room walls (6px thickness)
    { x: 500, y: 97, width: 300, height: 6 }, // North wall
    { x: 497, y: 100, width: 6, height: 200 }, // West wall
    { x: 797, y: 100, width: 6, height: 200 }, // East wall
    { x: 497, y: 297, width: 113, height: 6 }, // South wall left section
    { x: 690, y: 297, width: 113, height: 6 }, // South wall right section
];

function checkObstacleCollision(circleX, circleY, radius = 20) {
    for (let i = 0; i < OBSTACLES.length; i++) {
        const obs = OBSTACLES[i];
        const closestX = Math.max(obs.x, Math.min(circleX, obs.x + obs.width));
        const closestY = Math.max(obs.y, Math.min(circleY, obs.y + obs.height));
        const distX = circleX - closestX;
        const distY = circleY - closestY;
        if (distX * distX + distY * distY < radius * radius) {
            return true;
        }
    }
    return false;
}

function VirtualOffice({ earshotRadius = 200 }) {
    const canvasRef = useRef(null);
    const earshotRadiusRef = useRef(earshotRadius);

    useEffect(() => {
        earshotRadiusRef.current = earshotRadius;
    }, [earshotRadius]);

    // Our player's position
    const player = useRef({
        x: 400,
        y: 400,
    });

    // Keyboard keys
    const keys = useRef({});

    // Other players
    const remotePlayers = useRef({});

    useEffect(() => {
        const socket = io("http://localhost:5000");

        socket.on("connect", () => {
            console.log("Connected to ProxiSpeak server:", socket.id);
        });

        // Receive other players' positions
        socket.on("current-players", (players) => {
            remotePlayers.current = {};

            Object.values(players).forEach((otherPlayer) => {
                if (otherPlayer.id !== socket.id) {
                    remotePlayers.current[otherPlayer.id] = {
                        x: otherPlayer.x,
                        y: otherPlayer.y,
                        targetX: otherPlayer.x,
                        targetY: otherPlayer.y,
                    };
                }
            });
        });

        socket.on("player-joined", (otherPlayer) => {
            remotePlayers.current[otherPlayer.id] = {
                x: otherPlayer.x,
                y: otherPlayer.y,
                targetX: otherPlayer.x,
                targetY: otherPlayer.y,
            };
        });

        socket.on("player-moved", (otherPlayer) => {
            if (remotePlayers.current[otherPlayer.id]) {
                remotePlayers.current[otherPlayer.id].targetX = otherPlayer.x;
                remotePlayers.current[otherPlayer.id].targetY = otherPlayer.y;
            } else {
                remotePlayers.current[otherPlayer.id] = {
                    x: otherPlayer.x,
                    y: otherPlayer.y,
                    targetX: otherPlayer.x,
                    targetY: otherPlayer.y,
                };
            }
        });

        socket.on("player-disconnected", (playerId) => {
            delete remotePlayers.current[playerId];
        });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        canvas.width = 1000;
        canvas.height = 600;
        // Keyboard

        const handleKeyDown = (event) => {
            if (
                event.key === "ArrowUp" ||
                event.key === "ArrowDown" ||
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight"
            ) {
                event.preventDefault();
            }

            keys.current[event.key] = true;
        };

        const handleKeyUp = (event) => {
            keys.current[event.key] = false;
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        let animationFrameId;
        let isRunning = true;
        let lastSentPosition = {
            x: player.current.x,
            y: player.current.y,
        };
        let lastEmitTime = 0;

        // Game loop
        function gameLoop() {
            if (!isRunning) return;
            const speed = 3;
            let dx = 0;
            let dy = 0;

            // UP
            if (
                keys.current["ArrowUp"] ||
                keys.current["w"] ||
                keys.current["W"]
            ) {
                dy -= speed;
            }

            // DOWN
            if (
                keys.current["ArrowDown"] ||
                keys.current["s"] ||
                keys.current["S"]
            ) {
                dy += speed;
            }

            // LEFT
            if (
                keys.current["ArrowLeft"] ||
                keys.current["a"] ||
                keys.current["A"]
            ) {
                dx -= speed;
            }

            // RIGHT
            if (
                keys.current["ArrowRight"] ||
                keys.current["d"] ||
                keys.current["D"]
            ) {
                dx += speed;
            }

            // Move X with collision detection & boundary clamping
            if (dx !== 0) {
                const nextX = Math.max(30, Math.min(970, player.current.x + dx));
                if (!checkObstacleCollision(nextX, player.current.y, 20)) {
                    player.current.x = nextX;
                }
            }

            // Move Y with collision detection & boundary clamping
            if (dy !== 0) {
                const nextY = Math.max(30, Math.min(570, player.current.y + dy));
                if (!checkObstacleCollision(player.current.x, nextY, 20)) {
                    player.current.y = nextY;
                }
            }

            // Send our position only if player moved, throttled to ~30 updates/sec
            const hasMoved =
                player.current.x !== lastSentPosition.x ||
                player.current.y !== lastSentPosition.y;
            const now = performance.now();

            if (hasMoved && now - lastEmitTime >= 33) {
                lastSentPosition = {
                    x: player.current.x,
                    y: player.current.y,
                };
                lastEmitTime = now;

                socket.emit("player-move", {
                    x: player.current.x,
                    y: player.current.y,
                });
            }

            // Interpolate remote player positions (lerp) for smooth 60 FPS motion
            const LERP_FACTOR = 0.25;
            Object.values(remotePlayers.current).forEach((otherPlayer) => {
                otherPlayer.x += (otherPlayer.targetX - otherPlayer.x) * LERP_FACTOR;
                otherPlayer.y += (otherPlayer.targetY - otherPlayer.y) * LERP_FACTOR;

                if (Math.abs(otherPlayer.targetX - otherPlayer.x) < 0.05) {
                    otherPlayer.x = otherPlayer.targetX;
                }
                if (Math.abs(otherPlayer.targetY - otherPlayer.y) < 0.05) {
                    otherPlayer.y = otherPlayer.targetY;
                }
            });

            // Clear canvas
            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            // Background
            ctx.fillStyle = "#f3f4f6";
            ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            // Office boundary
            ctx.strokeStyle = "#222";
            ctx.lineWidth = 4;
            ctx.strokeRect(
                10,
                10,
                980,
                580
            );

            // Desk
            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(
                150,
                150,
                180,
                80
            );
            ctx.strokeStyle = "#5c3a1e";
            ctx.lineWidth = 2;
            ctx.strokeRect(
                150,
                150,
                180,
                80
            );

            // Desk text
            ctx.fillStyle = "#ffffff";
            ctx.font = "14px Arial";
            ctx.textAlign = "center";
            ctx.fillText("Desk", 240, 195);
            ctx.textAlign = "start";

            // Meeting room walls with doorway
            ctx.strokeStyle = "#555";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(610, 300);
            ctx.lineTo(500, 300);
            ctx.lineTo(500, 100);
            ctx.lineTo(800, 100);
            ctx.lineTo(800, 300);
            ctx.lineTo(690, 300);
            ctx.stroke();

            // Doorway threshold
            ctx.beginPath();
            ctx.strokeStyle = "#9ca3af";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(610, 300);
            ctx.lineTo(690, 300);
            ctx.stroke();
            ctx.setLineDash([]);

            // Doorway label
            ctx.fillStyle = "#6b7280";
            ctx.font = "11px Arial";
            ctx.textAlign = "center";
            ctx.fillText("DOOR", 650, 314);
            ctx.textAlign = "start";

            // Meeting room text
            ctx.fillStyle = "#333";
            ctx.font = "20px Arial";
            ctx.fillText(
                "Meeting Room",
                580,
                190
            );

            const currentEarshot = earshotRadiusRef.current;

            // -------------------------
            // DRAW EARSHOT RADIUS CIRCLE
            // -------------------------
            ctx.beginPath();
            ctx.arc(
                player.current.x,
                player.current.y,
                currentEarshot,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
            ctx.fill();
            ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.closePath();

            // -------------------------
            // DRAW OTHER PLAYERS
            // -------------------------
            Object.values(remotePlayers.current).forEach(
                (otherPlayer) => {
                    const dx = otherPlayer.x - player.current.x;
                    const dy = otherPlayer.y - player.current.y;
                    const distance = Math.hypot(dx, dy);
                    const isInsideEarshot = distance <= currentEarshot;

                    if (isInsideEarshot) {
                        // Inside earshot: active green indicator aura + vibrant avatar
                        ctx.beginPath();
                        ctx.arc(otherPlayer.x, otherPlayer.y, 25, 0, Math.PI * 2);
                        ctx.strokeStyle = "rgba(34, 197, 94, 0.7)";
                        ctx.lineWidth = 2.5;
                        ctx.stroke();
                        ctx.closePath();

                        ctx.beginPath();
                        ctx.arc(
                            otherPlayer.x,
                            otherPlayer.y,
                            20,
                            0,
                            Math.PI * 2
                        );
                        ctx.fillStyle = "#16a34a";
                        ctx.fill();
                        ctx.strokeStyle = "#14532d";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.closePath();

                        // Status tag
                        ctx.fillStyle = "#15803d";
                        ctx.font = "bold 11px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText(
                            `In Earshot (${Math.round(distance)}px)`,
                            otherPlayer.x,
                            otherPlayer.y - 30
                        );
                        ctx.textAlign = "start";
                    } else {
                        // Outside earshot: muted / out of range
                        ctx.beginPath();
                        ctx.arc(
                            otherPlayer.x,
                            otherPlayer.y,
                            20,
                            0,
                            Math.PI * 2
                        );
                        ctx.fillStyle = "rgba(220, 38, 38, 0.35)";
                        ctx.fill();
                        ctx.strokeStyle = "rgba(185, 28, 28, 0.4)";
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        ctx.closePath();

                        // Status tag
                        ctx.fillStyle = "#9ca3af";
                        ctx.font = "11px Arial";
                        ctx.textAlign = "center";
                        ctx.fillText(
                            `Out of Range (${Math.round(distance)}px)`,
                            otherPlayer.x,
                            otherPlayer.y - 26
                        );
                        ctx.textAlign = "start";
                    }
                }
            );

            // -------------------------
            // DRAW OUR PLAYER
            // -------------------------
            ctx.beginPath();
            ctx.arc(
                player.current.x,
                player.current.y,
                20,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = "#2563eb";
            ctx.fill();
            ctx.strokeStyle = "#1d4ed8";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.closePath();

            // Local player label
            ctx.fillStyle = "#1e40af";
            ctx.font = "bold 11px Arial";
            ctx.textAlign = "center";
            ctx.fillText("You", player.current.x, player.current.y - 26);
            ctx.textAlign = "start";

            // Earshot HUD info in corner
            ctx.fillStyle = "#4b5563";
            ctx.font = "12px Arial";
            ctx.fillText(`Earshot Radius: ${currentEarshot}px`, 25, 35);

            // Continue animation
            animationFrameId = requestAnimationFrame(gameLoop);
        }

        animationFrameId = requestAnimationFrame(gameLoop);

        // Cleanup
        return () => {
            isRunning = false;
            cancelAnimationFrame(animationFrameId);

            window.removeEventListener(
                "keydown",
                handleKeyDown
            );

            window.removeEventListener(
                "keyup",
                handleKeyUp
            );

            socket.disconnect();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                border: "1px solid #333",
            }}
        />
    );
}

export default VirtualOffice;