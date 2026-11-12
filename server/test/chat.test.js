import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";
import { setupSocketHandlers } from "../src/sockets/socketHandler.js";

function once(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} timed out`)), timeout);
    socket.once(event, (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

test("Chat - broadcasts messages only to users in the joined room", async () => {
  const httpServer = createServer();
  const io = new Server(httpServer);
  setupSocketHandlers(io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  const alice = Client(`http://localhost:${address.port}`, { transports: ["websocket"] });
  const bob = Client(`http://localhost:${address.port}`, { transports: ["websocket"] });
  const outsider = Client(`http://localhost:${address.port}`, { transports: ["websocket"] });

  try {
    await Promise.all([once(alice, "connect"), once(bob, "connect"), once(outsider, "connect")]);
    const aliceJoined = new Promise((resolve) => {
      alice.emit("join", { username: "Alice", roomName: "Team A", x: 100, y: 100 }, resolve);
    });
    assert.deepEqual(await aliceJoined, {
      ok: true,
      roomName: "team a",
      chatMessages: [],
      meetingChatMessages: []
    });

    const bobJoined = new Promise((resolve) => {
      bob.emit("join", { username: "Bob", roomName: "Team A", x: 200, y: 200 }, resolve);
    });
    assert.deepEqual(await bobJoined, {
      ok: true,
      roomName: "team a",
      chatMessages: [],
      meetingChatMessages: []
    });

    const outsiderJoined = new Promise((resolve) => {
      outsider.emit("join", { username: "Eve", roomName: "Team B", x: 300, y: 300 }, resolve);
    });
    assert.deepEqual(await outsiderJoined, {
      ok: true,
      roomName: "team b",
      chatMessages: [],
      meetingChatMessages: []
    });

    const aliceMessage = once(alice, "chat:message");
    const bobMessage = once(bob, "chat:message");
    const sent = new Promise((resolve) => {
      alice.emit("chat:message", { text: "  Hello team  ", scope: "room" }, resolve);
    });
    let outsiderReceivedMessage = false;
    outsider.on("chat:message", () => { outsiderReceivedMessage = true; });

    const [toAlice, toBob] = await Promise.all([aliceMessage, bobMessage]);
    assert.deepEqual(await sent, { ok: true, id: toAlice.id });
    assert.equal(toAlice.text, "Hello team");
    assert.equal(toAlice.scope, "room");
    assert.equal(toAlice.roomName, "team a");
    assert.equal(toBob.sender, "Alice");
    assert.equal(toBob.senderId, alice.id);
    assert.equal(toBob.time, toAlice.time);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(outsiderReceivedMessage, false);

    const allMessages = Promise.all([
      once(alice, "chat:message"),
      once(bob, "chat:message"),
      once(outsider, "chat:message")
    ]);
    const allSent = new Promise((resolve) => {
      alice.emit("chat:message", { text: "  Office-wide  ", scope: "all" }, resolve);
    });
    const allDelivered = await allMessages;
    assert.deepEqual(await allSent, { ok: true, id: allDelivered[0].id });
    assert.ok(allDelivered.every((message) => message.scope === "all" && message.text === "Office-wide"));

    const aliceDirect = once(alice, "chat:direct:message");
    const bobDirect = once(bob, "chat:direct:message");
    const directSent = new Promise((resolve) => {
      alice.emit("chat:direct:message", { text: "Private hello", targetId: bob.id }, resolve);
    });
    const [directToAlice, directToBob] = await Promise.all([aliceDirect, bobDirect]);
    assert.deepEqual(await directSent, { ok: true, id: directToAlice.id });
    assert.equal(directToAlice.scope, "direct");
    assert.equal(directToBob.text, "Private hello");
    assert.equal(directToBob.senderId, alice.id);

    const directHistory = await new Promise((resolve) => {
      bob.emit("chat:direct:history", { targetId: alice.id }, resolve);
    });
    assert.equal(directHistory.ok, true);
    assert.equal(directHistory.messages.length, 1);
    assert.equal(directHistory.messages[0].text, "Private hello");

    const forbiddenDirect = await new Promise((resolve) => {
      alice.emit("chat:direct:message", { text: "Should not deliver", targetId: outsider.id }, resolve);
    });
    assert.deepEqual(forbiddenDirect, { ok: false, error: "recipient-unavailable" });

    const [roomHistory, meetingHistory] = await Promise.all([
      new Promise((resolve) => alice.emit("chat:history", { scope: "room" }, resolve)),
      new Promise((resolve) => alice.emit("chat:history", { scope: "all" }, resolve))
    ]);
    assert.equal(roomHistory.messages.length, 1);
    assert.equal(roomHistory.messages[0].text, "Hello team");
    assert.equal(meetingHistory.messages.length, 1);
    assert.equal(meetingHistory.messages[0].text, "Office-wide");

    const lateJoiner = Client(`http://localhost:${address.port}`, { transports: ["websocket"] });
    await once(lateJoiner, "connect");
    const lateJoinResult = new Promise((resolve) => {
      lateJoiner.emit("join", { username: "Charlie", roomName: " TEAM A ", x: 120, y: 120 }, resolve);
    });
    const lateJoin = await lateJoinResult;
    assert.equal(lateJoin.chatMessages.length, 1);
    assert.equal(lateJoin.chatMessages[0].text, "Hello team");
    assert.equal(lateJoin.meetingChatMessages.length, 1);
    assert.equal(lateJoin.meetingChatMessages[0].text, "Office-wide");

    alice.disconnect();
    bob.disconnect();
    lateJoiner.disconnect();
    const disconnectDeadline = Date.now() + 3000;
    while ((await io.in("team a").fetchSockets()).length && Date.now() < disconnectDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const nextMeeting = Client(`http://localhost:${address.port}`, { transports: ["websocket"] });
    await once(nextMeeting, "connect");
    const newMeetingJoin = new Promise((resolve) => {
      nextMeeting.emit("join", { username: "Dana", roomName: "Team A", x: 100, y: 100 }, resolve);
    });
    const newMeeting = await newMeetingJoin;
    assert.deepEqual(newMeeting.chatMessages, []);
    assert.equal(newMeeting.meetingChatMessages.length, 1);
    assert.equal(newMeeting.meetingChatMessages[0].text, "Office-wide");

    nextMeeting.disconnect();
    outsider.disconnect();
    const meetingDisconnectDeadline = Date.now() + 3000;
    while ((await io.in("office:all").fetchSockets()).length && Date.now() < meetingDisconnectDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    const afterMeeting = Client(`http://localhost:${address.port}`, { transports: ["websocket"] });
    await once(afterMeeting, "connect");
    const afterMeetingJoin = new Promise((resolve) => {
      afterMeeting.emit("join", { username: "Erin", roomName: "Team A", x: 100, y: 100 }, resolve);
    });
    const clearedMeeting = await afterMeetingJoin;
    assert.deepEqual(clearedMeeting.chatMessages, []);
    assert.deepEqual(clearedMeeting.meetingChatMessages, []);
    afterMeeting.disconnect();
    nextMeeting.disconnect();
  } finally {
    alice.disconnect();
    bob.disconnect();
    outsider.disconnect();
    await new Promise((resolve) => io.close(resolve));
  }
});
