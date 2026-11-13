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

test("Office actions - hand raises and announcements reach only the joined room", async () => {
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
    await Promise.all([
      join(alice, "Alice", "actions-room"),
      join(bob, "Bob", "actions-room"),
      join(outsider, "Eve", "other-room")
    ]);

    const aliceAction = once(alice, "meeting:action");
    const bobAction = once(bob, "meeting:action");
    alice.emit("meeting:action", { action: "hand", value: true });
    const [forAlice, forBob] = await Promise.all([aliceAction, bobAction]);
    assert.deepEqual(forAlice, forBob);
    assert.equal(forBob.username, "Alice");
    assert.equal(forBob.value, true);

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
  } finally {
    alice.disconnect();
    bob.disconnect();
    outsider.disconnect();
    await new Promise((resolve) => io.close(resolve));
    if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
  }
});
