const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
    {
        playerId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
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
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
                required: true,
            },
            coordinates: {
                type: [Number], // [lng, lat]
                required: true,
            },
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

// 2dsphere index for geospatial proximity queries
playerSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Player", playerSchema);
