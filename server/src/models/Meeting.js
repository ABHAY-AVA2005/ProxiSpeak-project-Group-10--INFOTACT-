import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    startsAt: { type: Date, required: true, index: true },
    duration: { type: Number, required: true, min: 15, max: 480 },
    participantEmails: { type: [String], default: [] },
    roomName: { type: String, required: true, trim: true, maxlength: 40 }
  },
  { timestamps: true }
);

export const Meeting = mongoose.models.Meeting || mongoose.model("Meeting", meetingSchema);
