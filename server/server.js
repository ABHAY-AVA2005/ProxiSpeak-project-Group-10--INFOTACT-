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

// GeoJSON coordinate scaling for 2dsphere index:
// MongoDB 2dsphere strictly requires longitude in [-180, 180] and latitude in [-90, 90].
// Canvas coordinates (1000 x 600) scaled by 0.1 yield [0..100, 0..60], which are valid spherical coordinates.
const GEO_SCALE = 0.1;
function toGeoCoordinates(x, y) {
    return [x * GEO_SCALE, y * GEO_SCALE];
}

mongoose
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

// Create HTTP server
const server = http.createServer(app);

// Create Socket.io server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});

// Store all connected players
const players = {};

// Test route
app.get("/", (req, res) => {
    res.send("ProxiSpeak server is running");
});

// When a user connects
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Create this player's starting position
    players[socket.id] = {
        id: socket.id,
        x: 400,
        y: 400,
    };

    // Send all existing players to the new player
    socket.emit("current-players", players);

    // Tell all other players that a new player joined
    socket.broadcast.emit("player-joined", players[socket.id]);

    // Synchronize player join with MongoDB (create/upsert)
    Player.findOneAndUpdate(
        { playerId: socket.id },
        {
            playerId: socket.id,
            x: players[socket.id].x,
            y: players[socket.id].y,
            location: {
                type: "Point",
                coordinates: toGeoCoordinates(
                    players[socket.id].x,
                    players[socket.id].y
                ),
            },
            lastSeen: new Date(),
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).catch((dbErr) => {
        console.error(
            `MongoDB error creating player ${socket.id}:`,
            dbErr.message
        );
    });

    // When a player moves
    socket.on("player-move", (position) => {
        // Defensive check: ensure player exists and position is valid
        if (
            !players[socket.id] ||
            !position ||
            typeof position.x !== "number" ||
            typeof position.y !== "number"
        ) {
            return;
        }

        // Update player's position in memory
        players[socket.id].x = position.x;
        players[socket.id].y = position.y;

        // Send movement to all other players
        socket.broadcast.emit("player-moved", {
            id: socket.id,
            x: position.x,
            y: position.y,
        });

        // Synchronize player movement with MongoDB
        Player.updateOne(
            { playerId: socket.id },
            {
                $set: {
                    x: position.x,
                    y: position.y,
                    "location.coordinates": toGeoCoordinates(
                        position.x,
                        position.y
                    ),
                    lastSeen: new Date(),
                },
            }
        ).catch((dbErr) => {
            console.error(
                `MongoDB error updating movement for player ${socket.id}:`,
                dbErr.message
            );
        });
    });

    // When a player disconnects
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);

        // Remove player from server in-memory state
        if (players[socket.id]) {
            delete players[socket.id];
        }

        // Tell remaining players
        socket.broadcast.emit(
            "player-disconnected",
            socket.id
        );

        // Synchronize player disconnect with MongoDB (remove document)
        Player.deleteOne({ playerId: socket.id }).catch((dbErr) => {
            console.error(
                `MongoDB error deleting player ${socket.id}:`,
                dbErr.message
            );
        });
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`ProxiSpeak server running on port ${PORT}`);
});