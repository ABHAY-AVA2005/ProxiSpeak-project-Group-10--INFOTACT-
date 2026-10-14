import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    playerId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    username: {
      type: String,
      trim: true,
      default: "Anonymous"
    },
    // Flat pixel coordinates on the 2D world canvas
    x: {
      type: Number,
      required: true,
      default: 100
    },
    y: {
      type: Number,
      required: true,
      default: 100
    },
    // 2D geospatial position array [x, y] in canvas pixels
    // Used with MongoDB 2d index for Euclidean $near proximity queries
    position: {
      type: [Number],
      required: true,
      default: [100, 100]
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// 2D geospatial index for flat Cartesian coordinates ([x, y])
// Allows $near queries with direct pixel distances (e.g. $maxDistance: 100)
playerSchema.index({ position: "2d" });

export const Player = mongoose.models.Player || mongoose.model("Player", playerSchema);
