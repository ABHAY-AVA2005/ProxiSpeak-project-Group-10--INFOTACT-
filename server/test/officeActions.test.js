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

test("Office actions - reactions respect the room host and room scope", async () => {
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
    const join = (socket, username, roomName) => new Promise((resolve) => {
      socket.emit("join", { username, roomName, x: 100, y: 100 }, resolve);
    });
    const aliceJoin = await join(alice, "Alice", "actions-room");
    const bobJoin = await join(bob, "Bob", "actions-room");
    await join(outsider, "Eve", "other-room");
    assert.equal(aliceJoin.roomControls.hostSocketId, alice.id);
    assert.equal(bobJoin.roomControls.hostSocketId, alice.id);

    const unauthorizedToggle = await new Promise((resolve) => {
      bob.emit("room:reactions:set", { enabled: false }, resolve);
    });
    assert.equal(unauthorizedToggle.ok, false);

    const roomControlsUpdate = once(bob, "room:controls");
    const disableReactions = await new Promise((resolve) => {
      alice.emit("room:reactions:set", { enabled: false }, resolve);
    });
    assert.equal(disableReactions.ok, true);
    assert.equal((await roomControlsUpdate).reactionsEnabled, false);

    const blockedReaction = await new Promise((resolve) => {
      bob.emit("meeting:action", { action: "reaction", value: "👏" }, resolve);
    });
    assert.equal(blockedReaction.ok, false);
    assert.match(blockedReaction.error, /disabled by the room host/i);

    const enableReactions = await new Promise((resolve) => {
      alice.emit("room:reactions:set", { enabled: true }, resolve);
    });
    assert.equal(enableReactions.ok, true);

    const aliceAction = once(alice, "meeting:action");
    const bobAction = once(bob, "meeting:action");
    alice.emit("meeting:action", { action: "hand", value: true });
    const [forAlice, forBob] = await Promise.all([aliceAction, bobAction]);
    assert.deepEqual(forAlice, forBob);
    assert.equal(forBob.username, "Alice");
    assert.equal(forBob.value, true);

    await new Promise((resolve) => setTimeout(resolve, 110));
    const aliceReaction = once(alice, "meeting:action");
    const bobReaction = once(bob, "meeting:action");
    const reactionSent = new Promise((resolve) => {
      alice.emit("meeting:action", { action: "reaction", value: "💡" }, resolve);
    });
    const [forAliceReaction, forBobReaction, reactionResponse] = await Promise.all([
      aliceReaction,
      bobReaction,
      reactionSent
    ]);
    assert.deepEqual(forAliceReaction, forBobReaction);
    assert.equal(forBobReaction.username, "Alice");
    assert.equal(forBobReaction.value, "💡");
    assert.ok(forBobReaction.reactionId);
    assert.equal(reactionResponse.ok, true);

    const outsiderReceived = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 100);
      outsider.once("office:announcement", () => { clearTimeout(timer); resolve(true); });
    });
    const bobAnnouncement = once(bob, "office:announcement");
    const sent = new Promise((resolve) => {
      alice.emit("office:announcement", { text: "  Team update  " }, resolve);
    });
    const message = await bobAnnouncement;
    assert.equal((await sent).ok, true);
    assert.equal(message.text, "Team update");
    assert.equal(message.username, "Alice");
    assert.equal(await outsiderReceived, false);

    const aliceOfficeAnnouncement = once(alice, "office:announcement");
    const outsiderOfficeAnnouncement = once(outsider, "office:announcement");
    const officeAnnouncementSent = new Promise((resolve) => {
      bob.emit("office:announcement", { text: "Office-wide update", scope: "all" }, resolve);
    });
    const [aliceOfficeMessage, outsiderOfficeMessage, officeAnnouncementResult] = await Promise.all([
      aliceOfficeAnnouncement,
      outsiderOfficeAnnouncement,
      officeAnnouncementSent
    ]);
    assert.equal(officeAnnouncementResult.ok, true);
    assert.equal(aliceOfficeMessage.text, "Office-wide update");
    assert.equal(outsiderOfficeMessage.text, "Office-wide update");

    const hostTransfer = once(bob, "room:controls");
    alice.disconnect();
    const nextHostControls = await hostTransfer;
    assert.equal(nextHostControls.hostSocketId, bob.id);
    const nextHostToggle = await new Promise((resolve) => {
      bob.emit("room:reactions:set", { enabled: false }, resolve);
    });
    assert.equal(nextHostToggle.ok, true);
  } finally {
    alice.disconnect();
    bob.disconnect();
    outsider.disconnect();
    await new Promise((resolve) => io.close(resolve));
    if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
  }
});
