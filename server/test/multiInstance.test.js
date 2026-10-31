import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";
import { setupSocketHandlers } from "../src/sockets/socketHandler.js";

function listenOnAvailablePort(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server.address().port);
    };

    server.once("error", onError);
    server.listen(0, onListening);
  });
}

test("Multi-Instance - 2 Node instances accept connections and handle lifecycle independently", async () => {
  const server1 = createServer();
  const io1 = new Server(server1, { cors: { origin: "*" } });
  setupSocketHandlers(io1);

  const server2 = createServer();
  const io2 = new Server(server2, { cors: { origin: "*" } });
  setupSocketHandlers(io2);

  const port1 = await listenOnAvailablePort(server1);
  const port2 = await listenOnAvailablePort(server2);

  const alice = Client(`http://localhost:${port1}`, { transports: ["websocket"] });
  const alicePeer = Client(`http://localhost:${port1}`, { transports: ["websocket"] });
  const bob = Client(`http://localhost:${port2}`, { transports: ["websocket"] });
  const bobPeer = Client(`http://localhost:${port2}`, { transports: ["websocket"] });

  try {
    await Promise.all([
      new Promise((resolve) => alice.on("connect", resolve)),
      new Promise((resolve) => alicePeer.on("connect", resolve)),
      new Promise((resolve) => bob.on("connect", resolve)),
      new Promise((resolve) => bobPeer.on("connect", resolve))
    ]);

    assert.ok(alice.id, "Alice should receive a socket ID");
    assert.ok(alicePeer.id, "Alice peer should receive a socket ID");
    assert.ok(bob.id, "Bob should receive a socket ID");
    assert.ok(bobPeer.id, "Bob peer should receive a socket ID");

    const joinAlicePromise = new Promise((resolve) => {
      alice.on("users:list", (list) => resolve(list));
    });
    alice.emit("join", { username: "Alice", x: 100, y: 100 });
    const listAlice = await joinAlicePromise;
    assert.ok(Array.isArray(listAlice));

    const joinAlicePeerPromise = new Promise((resolve) => {
      alicePeer.on("users:list", (list) => resolve(list));
    });
    alicePeer.emit("join", { username: "Charlie", x: 140, y: 100 });
    const listAlicePeer = await joinAlicePeerPromise;
    assert.ok(Array.isArray(listAlicePeer));

    const moveAlicePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Alice move broadcast timed out")), 2000);
      alicePeer.on("user:moved", (data) => {
        if (data.socketId === alice.id) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });
    alice.emit("move", { x: 110, y: 105 });
    const movedAliceData = await moveAlicePromise;
    assert.equal(movedAliceData.x, 110);
    assert.equal(movedAliceData.y, 105);

    const joinBobPromise = new Promise((resolve) => {
      bob.on("users:list", (list) => resolve(list));
    });
    bob.emit("join", { username: "Bob", x: 200, y: 200 });
    const listBob = await joinBobPromise;
    assert.ok(Array.isArray(listBob));

    const joinBobPeerPromise = new Promise((resolve) => {
      bobPeer.on("users:list", (list) => resolve(list));
    });
    bobPeer.emit("join", { username: "Dana", x: 240, y: 200 });
    const listBobPeer = await joinBobPeerPromise;
    assert.ok(Array.isArray(listBobPeer));

    const moveBobPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Bob move broadcast timed out")), 2000);
      bobPeer.on("user:moved", (data) => {
        if (data.socketId === bob.id) {
          clearTimeout(timeout);
          resolve(data);
        }
      });
    });
    bob.emit("move", { x: 210, y: 205 });
    const movedBobData = await moveBobPromise;
    assert.equal(movedBobData.x, 210);
    assert.equal(movedBobData.y, 205);

  } finally {
    alice.disconnect();
    alicePeer.disconnect();
    bob.disconnect();
    bobPeer.disconnect();
    await new Promise((resolve) => server1.close(resolve));
    await new Promise((resolve) => server2.close(resolve));
  }
});

