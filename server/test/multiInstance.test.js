import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "http";
import { Server } from "socket.io";
import { io as Client } from "socket.io-client";
import { setupSocketHandlers } from "../src/sockets/socketHandler.js";

test("Multi-Instance - 2 Node instances accept connections and handle lifecycle independently", async () => {
  const server1 = createServer();
  const io1 = new Server(server1, { cors: { origin: "*" } });
  setupSocketHandlers(io1);

  const server2 = createServer();
  const io2 = new Server(server2, { cors: { origin: "*" } });
  setupSocketHandlers(io2);

  await new Promise((resolve) => server1.listen(5103, resolve));
  await new Promise((resolve) => server2.listen(5104, resolve));

  const client1 = Client("http://localhost:5103", { transports: ["websocket"] });
  const client2 = Client("http://localhost:5104", { transports: ["websocket"] });

  try {
    await Promise.all([
      new Promise((resolve) => client1.on("connect", resolve)),
      new Promise((resolve) => client2.on("connect", resolve))
    ]);

    assert.ok(client1.id, "Client 1 should receive a socket ID");
    assert.ok(client2.id, "Client 2 should receive a socket ID");

    // Client 1 joins instance 1
    const join1Promise = new Promise((resolve) => {
      client1.on("users:list", (list) => resolve(list));
    });
    client1.emit("join", { username: "Alice", x: 100, y: 100 });
    const list1 = await join1Promise;
    assert.ok(Array.isArray(list1));

    // Client 2 joins instance 2
    const join2Promise = new Promise((resolve) => {
      client2.on("users:list", (list) => resolve(list));
    });
    client2.emit("join", { username: "Bob", x: 200, y: 200 });
    const list2 = await join2Promise;
    assert.ok(Array.isArray(list2));

    // Movement on client 1
    const movePromise = new Promise((resolve) => {
      client1.on("user:moved", (data) => {
        if (data.socketId === client1.id) resolve(data);
      });
    });
    client1.emit("move", { x: 110, y: 105 });
    const movedData = await movePromise;
    assert.equal(movedData.x, 110);
    assert.equal(movedData.y, 105);

  } finally {
    client1.disconnect();
    client2.disconnect();
    await new Promise((resolve) => server1.close(resolve));
    await new Promise((resolve) => server2.close(resolve));
  }
});

