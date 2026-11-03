import mongoose from "mongoose";

const roomObstacleSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true
    },
    x: {
      type: Number,
      required: true,
      default: 0
    },
    y: {
      type: Number,
      required: true,
      default: 0
    },
    width: {
      type: Number,
      required: true,
      default: 0
    },
    height: {
      type: Number,
      required: true,
      default: 0
    }
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: "default-room"
    },
    width: {
      type: Number,
      required: true,
      default: 2000
    },
    height: {
      type: Number,
      required: true,
      default: 2000
    },
    obstacles: {
      type: [roomObstacleSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

export const Room = mongoose.models.Room || mongoose.model("Room", roomSchema);
