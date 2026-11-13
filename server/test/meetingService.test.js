import test from "node:test";
import assert from "node:assert/strict";

import {
  createMeeting,
  deleteMeeting,
  listMeetings,
  normalizeMeeting,
  sendMeetingInvitations
} from "../src/services/meetingService.js";

const ownerId = "test-owner-0123456789abcdef01234567";

function validMeeting(overrides = {}) {
  return {
    ownerId,
    title: "Design review",
    description: "Review the updated office experience.",
    startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    duration: 60,
    participantEmails: ["team@example.com"],
    roomName: `meeting-test-${Date.now()}`,
    ...overrides
  };
}

test("MeetingService - normalizes meeting fields and invitees", () => {
  const meeting = normalizeMeeting(validMeeting({
    title: "  Design review  ",
    roomName: "  Design-Team  ",
    participantEmails: [" TEAM@example.com ", "team@example.com"]
  }));
  assert.equal(meeting.title, "Design review");
  assert.equal(meeting.roomName, "design-team");
  assert.deepEqual(meeting.participantEmails, ["team@example.com"]);
});

test("MeetingService - rejects invalid owner, date, duration, and invitees", () => {
  assert.throws(() => normalizeMeeting(validMeeting({ ownerId: "short" })), /owner/);
  assert.throws(() => normalizeMeeting(validMeeting({ startsAt: "not-a-date" })), /future/);
  assert.throws(() => normalizeMeeting(validMeeting({ duration: 61 })), /duration/);
  assert.throws(() => normalizeMeeting(validMeeting({ participantEmails: ["invalid"] })), /email/);
});

test("MeetingService - stores meetings in memory and restricts deletion to the owner", async () => {
  const meetingData = validMeeting({ participantEmails: [] });
  const saved = await createMeeting(meetingData);
  const listed = await listMeetings(meetingData.roomName, ownerId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, saved.id);
  assert.equal(listed[0].canDelete, true);
  assert.equal(await deleteMeeting(saved.id, "another-owner-0123456789abcdef"), false);
  assert.equal(await deleteMeeting(saved.id, ownerId), true);
  assert.equal((await listMeetings(meetingData.roomName, ownerId)).length, 0);
});

test("MeetingService - skips email delivery when no recipients were provided", async () => {
  assert.deepEqual(await sendMeetingInvitations({ participantEmails: [] }), { status: "no-recipients" });
});
