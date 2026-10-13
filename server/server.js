require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const Player = require("./models/Player");

const app = express();

// Allow React frontend to communicate with server
app.use(cors());

// MongoDB configuration
const PORT = process.env.PORT || 5000;
const MONGO_URI =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/proxispeak";

// Import validation constants and helper
const {
    CANVAS_BOUNDS,
    DB_DEBOUNCE_MS,
    isValidCoordinate,
} = require("./utils/validation");

const moveDebounceTimers = new Map();
const disconnectedSockets = new Set();
const inFlightWrites = new Map();

// Connect to MongoDB only when explicitly invoked (e.g. server startup)
function connectDB() {
    return mongoose
        .connect(MONGO_URI)
        .then(async () => {
            console.log("Connected to MongoDB successfully at", MONGO_URI);
            // Clear any stale player sessions from previous server runs
            try {
                await Player.deleteMany({});
            } catch (cleanupErr) {
                console.error("Error clearing stale players:", cleanupErr.message);
            }
        })
        .catch((err) => {
            console.error("MongoDB connection error:", err.message);
        });
}


// Create HTTP server
const server = http.createServer(app);

// Create Socket.io server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});

// Store all connected players in memory (single source of truth for real-time state)
const players = {};

// Test route
app.get("/", (req, res) => {
    res.send("ProxiSpeak server is running");
});

// When a user connects
function handleConnection(socket) {
    console.log("User connected:", socket.id);

    // Create this player's starting position in memory
    players[socket.id] = {
        id: socket.id,
        x: 400,
        y: 400,
    };

    // Send all existing players to the new player
    socket.emit("current-players", players);

    // Tell all other players that a new player joined
    socket.broadcast.emit("player-joined", players[socket.id]);

    // Synchronize player join with MongoDB (create/upsert with flat position [x, y])
    // Track promise in inFlightWrites to ensure disconnect awaits it before deleteOne runs
    const joinPromise = (async () => {
        try {
            return await Player.findOneAndUpdate(
                { playerId: socket.id },
                {
                    playerId: socket.id,
                    x: players[socket.id].x,
                    y: players[socket.id].y,
                    position: [players[socket.id].x, players[socket.id].y],
                    lastSeen: new Date(),
                },
                { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
            );
        } catch (dbErr) {
            console.error(
                `MongoDB error creating player ${socket.id}:`,
                dbErr.message
            );
        }
    })();

    inFlightWrites.set(socket.id, joinPromise);
    joinPromise.finally(() => {
        if (inFlightWrites.get(socket.id) === joinPromise) {
            inFlightWrites.delete(socket.id);
        }
    });

    // When a player moves
    socket.on("player-move", (position) => {
        // Defensive check: ensure player exists, is connected, and coordinates are valid finite numbers within canvas bounds
        if (
            !players[socket.id] ||
            disconnectedSockets.has(socket.id) ||
            !position ||
            !isValidCoordinate(position.x, position.y)
        ) {
            return;
        }

        // Update player's position in memory (single source of truth)
        players[socket.id].x = position.x;
        players[socket.id].y = position.y;

        // Broadcast real-time movement to all other players immediately (zero DB delay for smooth 60 FPS motion)
        socket.broadcast.emit("player-moved", {
            id: socket.id,
            x: position.x,
            y: position.y,
        });

        // Debounced database write:
        // 1. Clear any pending write timer for this socket
        if (moveDebounceTimers.has(socket.id)) {
            clearTimeout(moveDebounceTimers.get(socket.id));
        }

        // 2. Schedule a write to MongoDB after DB_DEBOUNCE_MS of inactivity
        const timer = setTimeout(async () => {
            moveDebounceTimers.delete(socket.id);

            // Safety check: ensure player is still connected and exists in memory before writing
            if (disconnectedSockets.has(socket.id) || !players[socket.id]) {
                return;
            }

            const latestX = players[socket.id].x;
            const latestY = players[socket.id].y;

            const writePromise = (async () => {
                try {
                    // Re-check disconnected status right before executing write
                    if (disconnectedSockets.has(socket.id)) {
                        return;
                    }
                    await Player.updateOne(
                        { playerId: socket.id },
                        {
                            $set: {
                                position: [latestX, latestY],
                                x: latestX,
                                y: latestY,
                                lastSeen: new Date(),
                            },
                        }
                    );
                } catch (dbErr) {
                    console.error(
                        `MongoDB error updating debounced movement for player ${socket.id}:`,
                        dbErr.message
                    );
                }
            })();

            inFlightWrites.set(socket.id, writePromise);
            try {
                await writePromise;
            } finally {
                if (inFlightWrites.get(socket.id) === writePromise) {
                    inFlightWrites.delete(socket.id);
                }
            }
        }, DB_DEBOUNCE_MS);

        moveDebounceTimers.set(socket.id, timer);
    });

    // When a player disconnects
    socket.on("disconnect", async () => {
        console.log("User disconnected:", socket.id);

        // 1. Mark as disconnected immediately so in-flight async operations cannot recreate or update this record
        disconnectedSockets.add(socket.id);

        // 2. Cancel any pending debounce timer
        const hadPendingDebounce = moveDebounceTimers.has(socket.id);
        if (hadPendingDebounce) {
            clearTimeout(moveDebounceTimers.get(socket.id));
            moveDebounceTimers.delete(socket.id);
        }

        // Capture latest in-memory state before deletion
        const playerState = players[socket.id];

        // 3. Remove player from server in-memory state
        if (players[socket.id]) {
            delete players[socket.id];
        }

        // 4. Notify remaining players
        socket.broadcast.emit(
            "player-disconnected",
            socket.id
        );

        // 5. Await any in-flight write currently running against MongoDB for this socket
        // This guarantees that earlier updateOne or findOneAndUpdate finishes BEFORE deleteOne runs
        if (inFlightWrites.has(socket.id)) {
            try {
                await inFlightWrites.get(socket.id);
            } catch (_) {}
            inFlightWrites.delete(socket.id);
        }

        // 6. Persist the latest position if a debounce write was pending, then delete the record
        try {
            if (hadPendingDebounce && playerState) {
                await Player.updateOne(
                    { playerId: socket.id },
                    {
                        $set: {
                            position: [playerState.x, playerState.y],
                            x: playerState.x,
                            y: playerState.y,
                            lastSeen: new Date(),
                        },
                    }
                );
            }
        } catch (dbErr) {
            console.error(
                `MongoDB error saving final position for disconnecting player ${socket.id}:`,
                dbErr.message
            );
        } finally {
            // 7. Delete player document from MongoDB
            try {
                await Player.deleteOne({ playerId: socket.id });
            } catch (delErr) {
                console.error(
                    `MongoDB error deleting player ${socket.id}:`,
                    delErr.message
                );
            }

            // Clean up disconnectedSockets set after a buffer period to prevent memory leaks
            const cleanupTimer = setTimeout(() => {
                disconnectedSockets.delete(socket.id);
            }, 5000);
            if (cleanupTimer.unref) {
                cleanupTimer.unref();
            }
        }
    });
}

// Register connection handler on Socket.IO
io.on("connection", handleConnection);

// Start server and connect to MongoDB when executed directly
if (require.main === module) {
    connectDB();
    server.listen(PORT, () => {
        console.log(`ProxiSpeak server running on port ${PORT}`);
    });
}

module.exports = {
    app,
    server,
    io,
    connectDB,
    handleConnection,
    CANVAS_BOUNDS,
    isValidCoordinate,
    DB_DEBOUNCE_MS,
    players,
    moveDebounceTimers,
    disconnectedSockets,
    inFlightWrites,
};
