const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
    {
        playerId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        username: {
            type: String,
            trim: true,
            default: "Anonymous",
        },
        // Flat pixel coordinates on the 2D canvas (1000 x 600)
        x: {
            type: Number,
            required: true,
            default: 400,
        },
        y: {
            type: Number,
            required: true,
            default: 400,
        },
        // 2D geospatial position array [x, y] in canvas pixels
        // Used with MongoDB 2d index for Euclidean $near proximity queries
        position: {
            type: [Number],
            required: true,
            default: [400, 400],
        },
        lastSeen: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// 2D geospatial index for flat Cartesian coordinates ([x, y])
// Allows $near queries with direct pixel distances (e.g. $maxDistance: 100)
playerSchema.index({ position: "2d" });

module.exports = mongoose.models.Player || mongoose.model("Player", playerSchema);
