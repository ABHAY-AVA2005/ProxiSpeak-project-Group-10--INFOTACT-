import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ROOM,
  getRoomByName,
  listRooms,
  normalizeRoom,
  upsertRoom
} from "../src/services/roomService.js";

test("RoomService - normalizes a room payload with valid obstacles", () => {
  const room = normalizeRoom({
    name: "team-room",
    width: 1500,
    height: 1100,
    obstacles: [
      { id: "desk-1", x: 100, y: 100, width: 220, height: 80 },
      { id: "desk-2", x: 400, y: 300, width: 120, height: 120 }
    ]
  });

  assert.equal(room.name, "team-room");
  assert.equal(room.width, 1500);
  assert.equal(room.height, 1100);
  assert.equal(room.obstacles.length, 2);
  assert.equal(room.obstacles[0].id, "desk-1");
});

test("RoomService - stores and reuses a default room in memory", async () => {
  const defaultRoom = await getRoomByName(DEFAULT_ROOM.name);
  assert.equal(defaultRoom.name, DEFAULT_ROOM.name);
  assert.equal(defaultRoom.width, DEFAULT_ROOM.width);
  assert.equal(defaultRoom.height, DEFAULT_ROOM.height);

  const rooms = await listRooms();
  assert.ok(Array.isArray(rooms));
  assert.ok(rooms.some((room) => room.name === DEFAULT_ROOM.name));
});

test("RoomService - upserts a custom room and keeps obstacle data", async () => {
  const room = await upsertRoom({
    name: "custom-room",
    width: 1200,
    height: 800,
    obstacles: [
      { id: "wall-1", x: 240, y: 200, width: 40, height: 350 }
    ]
  });

  assert.equal(room.name, "custom-room");
  assert.equal(room.obstacles[0].id, "wall-1");

  const savedRoom = await getRoomByName("custom-room");
  assert.equal(savedRoom.name, "custom-room");
  assert.equal(savedRoom.obstacles[0].width, 40);
});
