import mongoose from "mongoose";
import { Meeting } from "../models/Meeting.js";
import { isDbConnected } from "../config/db.js";

const meetingsInMemory = new Map();
const emailPattern = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const allowedDurations = new Set([15, 30, 45, 60, 90, 120, 180, 240, 480]);

export function normalizeMeeting(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Meeting payload must be an object.");
  }
  const ownerId = typeof payload.ownerId === "string" ? payload.ownerId.trim() : "";
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const roomName = typeof payload.roomName === "string" ? payload.roomName.trim().toLowerCase() : "";
  const startsAt = new Date(payload.startsAt);
  const duration = Number(payload.duration);
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const participantEmails = Array.isArray(payload.participantEmails) ? payload.participantEmails : [];

  if (ownerId.length < 24 || ownerId.length > 128) throw new TypeError("A valid meeting owner is required.");
  if (!title || title.length > 120) throw new TypeError("Meeting title must be between 1 and 120 characters.");
  if (!roomName || roomName.length > 40) throw new TypeError("A valid office room is required.");
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) throw new TypeError("Meeting start time must be in the future.");
  if (!allowedDurations.has(duration)) throw new TypeError("Meeting duration is not supported.");
  if (description.length > 1000) throw new TypeError("Meeting description must be at most 1000 characters.");
  if (participantEmails.length > 50) throw new TypeError("A meeting can have at most 50 invitees.");

  const emails = participantEmails.map((email) => typeof email === "string" ? email.trim().toLowerCase() : "");
  if (emails.some((email) => !emailPattern.test(email))) throw new TypeError("One or more invitee email addresses are invalid.");

  return {
    ownerId,
    title,
    description,
    startsAt,
    duration,
    participantEmails: [...new Set(emails)],
    roomName
  };
}

function serializeMeeting(meeting, ownerId) {
  return {
    id: String(meeting._id || meeting.id),
    title: meeting.title,
    description: meeting.description || "",
    startsAt: new Date(meeting.startsAt).toISOString(),
    duration: meeting.duration,
    participantEmails: meeting.participantEmails || [],
    roomName: meeting.roomName,
    createdAt: new Date(meeting.createdAt || Date.now()).toISOString(),
    canDelete: Boolean(ownerId && meeting.ownerId === ownerId)
  };
}

export async function listMeetings(roomName, ownerId) {
  if (isDbConnected()) {
    try {
      const docs = await Meeting.find({ roomName }).sort({ startsAt: 1 }).limit(100).lean();
      return docs.map((meeting) => serializeMeeting(meeting, ownerId));
    } catch (error) {
      console.error("[Meetings] Database read failed:", error.message);
      throw new Error("Meeting schedule is temporarily unavailable.");
    }
  }
  return [...meetingsInMemory.values()]
    .filter((meeting) => meeting.roomName === roomName)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, 100)
    .map((meeting) => serializeMeeting(meeting, ownerId));
}

export async function createMeeting(payload) {
  const normalized = normalizeMeeting(payload);
  if (isDbConnected()) {
    try {
      const meeting = await Meeting.create(normalized);
      return serializeMeeting(meeting.toObject(), normalized.ownerId);
    } catch (error) {
      console.error("[Meetings] Database create failed:", error.message);
      throw new Error("Meeting could not be saved.");
    }
  }
  const id = new mongoose.Types.ObjectId().toString();
  const meeting = { ...normalized, id, createdAt: new Date() };
  meetingsInMemory.set(id, meeting);
  return serializeMeeting(meeting, normalized.ownerId);
}

export async function deleteMeeting(id, ownerId) {
  if (!mongoose.isValidObjectId(id) || typeof ownerId !== "string" || ownerId.length < 24) return false;
  if (isDbConnected()) {
    try {
      const deleted = await Meeting.findOneAndDelete({ _id: id, ownerId });
      return Boolean(deleted);
    } catch (error) {
      console.error("[Meetings] Database delete failed:", error.message);
      throw new Error("Meeting could not be removed.");
    }
  }
  const meeting = meetingsInMemory.get(id);
  if (!meeting || meeting.ownerId !== ownerId) return false;
  meetingsInMemory.delete(id);
  return true;
}

export async function sendMeetingInvitations(meeting) {
  const emails = meeting.participantEmails || [];
  if (emails.length === 0) return { status: "no-recipients" };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { status: "not-configured" };

  const message = [
    `You are invited to ${meeting.title}.`,
    `Time: ${new Date(meeting.startsAt).toLocaleString()}`,
    `Duration: ${meeting.duration} minutes`,
    `Room: ${meeting.roomName}`,
    meeting.description ? `Details: ${meeting.description}` : "",
    `Join the office: ${process.env.CLIENT_URL || "https://proxi-speak-project-group-10-infota.vercel.app"}`
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ from, to: emails, subject: `Invitation: ${meeting.title}`, text: message })
    });
    if (!response.ok) {
      const details = await response.text();
      console.error("[Meetings] Email provider rejected the invitation:", response.status, details.slice(0, 300));
      return { status: "provider-error" };
    }
    return { status: "sent" };
  } catch (error) {
    console.error("[Meetings] Email provider request failed:", error.message);
    return { status: "provider-error" };
  }
}
