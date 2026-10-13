const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const mongoose = require("mongoose");
const Player = require("../models/Player");
const {
    io,
    handleConnection,
    players,
    moveDebounceTimers,
    disconnectedSockets,
    inFlightWrites,
    isValidCoordinate,
    CANVAS_BOUNDS,
    DB_DEBOUNCE_MS,
} = require("../server");

// Helper to create a mock Socket.IO socket that captures emits and broadcasts
function createMockSocket(id) {
    const socket = new EventEmitter();
    socket.id = id || `mock-socket-${Math.random().toString(36).substring(7)}`;
    socket.emitted = [];
    socket.broadcastEmitted = [];

    socket.emit = (event, ...args) => {
        socket.emitted.push({ event, args });
        return EventEmitter.prototype.emit.apply(socket, [event, ...args]);
    };

    socket.broadcast = {
        emit: (event, ...args) => {
            socket.broadcastEmitted.push({ event, args });
            return true;
        },
    };

    return socket;
}

// Stub Player.findOneAndUpdate by default in tests to prevent 10s offline buffering
const origFindOneAndUpdate = Player.findOneAndUpdate;
const defaultMockFindOneAndUpdate = async (...args) => {
    return { playerId: args[0]?.playerId, ...args[1] };
};
Player.findOneAndUpdate = defaultMockFindOneAndUpdate;

// ---------------------------------------------------------------------
// TEST SUITE 1: Coordinate Validation against Canvas Boundaries
// ---------------------------------------------------------------------
test("Coordinate Validation - Valid coordinates within 1000x600 canvas", () => {
    assert.equal(isValidCoordinate(400, 400), true);
    assert.equal(isValidCoordinate(0, 0), true);
    assert.equal(isValidCoordinate(1000, 600), true);
    assert.equal(isValidCoordinate(500, 300), true);
    assert.equal(isValidCoordinate(30, 30), true);
    assert.equal(isValidCoordinate(970, 570), true);
});

test("Coordinate Validation - Rejects out-of-bounds coordinates", () => {
    assert.equal(isValidCoordinate(-1, 300), false);
    assert.equal(isValidCoordinate(1001, 300), false);
    assert.equal(isValidCoordinate(500, -1), false);
    assert.equal(isValidCoordinate(500, 601), false);
    assert.equal(isValidCoordinate(-50, -50), false);
    assert.equal(isValidCoordinate(1500, 800), false);
});

test("Coordinate Validation - Rejects non-numbers, NaN, and Infinity", () => {
    assert.equal(isValidCoordinate("400", 300), false);
    assert.equal(isValidCoordinate(400, "300"), false);
    assert.equal(isValidCoordinate(NaN, 300), false);
    assert.equal(isValidCoordinate(400, NaN), false);
    assert.equal(isValidCoordinate(Infinity, 300), false);
    assert.equal(isValidCoordinate(400, -Infinity), false);
    assert.equal(isValidCoordinate(null, 300), false);
    assert.equal(isValidCoordinate(400, undefined), false);
    assert.equal(isValidCoordinate({}, 300), false);
});

// ---------------------------------------------------------------------
// TEST SUITE 2: Actual server.js Connection Handler
// ---------------------------------------------------------------------
test("Actual Server Handler - Connection initializes memory, emits events, and creates DB record", async () => {
    let findOneAndUpdateCalls = [];

    const customFind = async (...args) => {
        findOneAndUpdateCalls.push(args);
        return { playerId: args[0].playerId, ...args[1] };
    };
    Player.findOneAndUpdate = customFind;

    const socket = createMockSocket("socket-connect-test");

    try {
        // Trigger the actual connection handler in server.js
        handleConnection(socket);

        // Verify in-memory state in server.js
        assert.ok(players[socket.id], "Player must be added to server.js players map");
        assert.equal(players[socket.id].x, 400);
        assert.equal(players[socket.id].y, 400);

        // Verify initial socket emits
        const currentPlayersEmit = socket.emitted.find(
            (e) => e.event === "current-players"
        );
        assert.ok(currentPlayersEmit, "Must emit current-players to joining socket");

        const playerJoinedBroadcast = socket.broadcastEmitted.find(
            (e) => e.event === "player-joined"
        );
        assert.ok(playerJoinedBroadcast, "Must broadcast player-joined to other clients");
        assert.deepEqual(playerJoinedBroadcast.args[0], players[socket.id]);

        // Verify MongoDB join upsert was initiated with position: [400, 400]
        assert.equal(findOneAndUpdateCalls.length, 1);
        const [query, updateDoc] = findOneAndUpdateCalls[0];
        assert.equal(query.playerId, socket.id);
        assert.deepEqual(updateDoc.position, [400, 400]);
    } finally {
        Player.findOneAndUpdate = defaultMockFindOneAndUpdate;
        delete players[socket.id];
        moveDebounceTimers.delete(socket.id);
        inFlightWrites.delete(socket.id);
    }
});

// ---------------------------------------------------------------------
// TEST SUITE 3: Actual server.js Movement Handler & Debouncing
// ---------------------------------------------------------------------
test("Actual Server Handler - Rapid movements update memory & broadcast immediately, debouncing DB writes", async () => {
    const origUpdateOne = Player.updateOne;
    let updateOneCalls = [];

    Player.updateOne = async (...args) => {
        updateOneCalls.push(args);
        return { acknowledged: true, modifiedCount: 1 };
    };

    const socket = createMockSocket("socket-move-test");

    try {
        // Connect through actual server handler
        handleConnection(socket);

        // Reset broadcast captures from connect
        socket.broadcastEmitted = [];

        // Simulate 20 rapid movements (e.g. avatar moving across canvas)
        for (let i = 0; i < 20; i++) {
            socket.emit("player-move", { x: 400 + i, y: 400 + i });
            // Immediate verification: memory and broadcast happen on EVERY event without waiting for DB
            assert.equal(players[socket.id].x, 400 + i);
            assert.equal(players[socket.id].y, 400 + i);
        }

        // Verify all 20 movements were broadcast in real-time
        assert.equal(
            socket.broadcastEmitted.length,
            20,
            "Real-time movement must be broadcast immediately on every move event"
        );

        // Crucial debounce check: DURING rapid movement, zero database writes must have executed!
        assert.equal(
            updateOneCalls.length,
            0,
            "Intermediate movement events must NOT trigger database writes"
        );

        // Verify debounce timer is active in server.js
        assert.ok(
            moveDebounceTimers.has(socket.id),
            "Debounce timer must be active in server.js"
        );

        // Wait for debounce delay to expire
        await new Promise((r) => setTimeout(r, DB_DEBOUNCE_MS + 100));

        // After debounce interval, exactly ONE database write should have executed
        assert.equal(
            updateOneCalls.length,
            1,
            "Exactly 1 database write should occur after movement stops"
        );

        // The write must persist the final coordinates [419, 419]
        const [query, updateDoc] = updateOneCalls[0];
        assert.equal(query.playerId, socket.id);
        assert.deepEqual(
            updateDoc.$set.position,
            [419, 419],
            "Database write must persist final destination coordinates"
        );
        assert.equal(updateDoc.$set.x, 419);
        assert.equal(updateDoc.$set.y, 419);
    } finally {
        Player.updateOne = origUpdateOne;
        delete players[socket.id];
        moveDebounceTimers.delete(socket.id);
        inFlightWrites.delete(socket.id);
    }
});

// ---------------------------------------------------------------------
// TEST SUITE 4: Actual server.js Coordinate Validation Rejection
// ---------------------------------------------------------------------
test("Actual Server Handler - Rejects out-of-bounds coordinates without updating memory or broadcasting", () => {
    const socket = createMockSocket("socket-invalid-coords-test");

    try {
        handleConnection(socket);
        socket.broadcastEmitted = [];

        // Attempt out-of-bounds move
        socket.emit("player-move", { x: -100, y: 300 });

        // In-memory position must remain unchanged at (400, 400)
        assert.equal(players[socket.id].x, 400);
        assert.equal(players[socket.id].y, 400);

        // No broadcast emitted
        assert.equal(socket.broadcastEmitted.length, 0);

        // No debounce timer created
        assert.equal(moveDebounceTimers.has(socket.id), false);
    } finally {
        delete players[socket.id];
        moveDebounceTimers.delete(socket.id);
        inFlightWrites.delete(socket.id);
    }
});

// ---------------------------------------------------------------------
// TEST SUITE 5: Actual server.js Disconnect Handling & Race Condition Prevention
// ---------------------------------------------------------------------
test("Actual Server Handler - Disconnect cancels pending timer, persists final position, and deletes record", async () => {
    const origUpdateOne = Player.updateOne;
    const origDeleteOne = Player.deleteOne;
    const callLog = [];

    Player.updateOne = async (...args) => {
        callLog.push({ type: "UPDATE", args });
        return { acknowledged: true };
    };

    Player.deleteOne = async (...args) => {
        callLog.push({ type: "DELETE", args });
        return { acknowledged: true };
    };

    const socket = createMockSocket("socket-disconnect-test");

    try {
        handleConnection(socket);

        // Player moves to (480, 520) - starts a debounce timer
        socket.emit("player-move", { x: 480, y: 520 });
        assert.ok(moveDebounceTimers.has(socket.id), "Debounce timer must be pending");

        // Player disconnects BEFORE debounce timer fires: invoke and await actual disconnect handler
        const [disconnectHandler] = socket.listeners("disconnect");
        await disconnectHandler();

        // 1. Pending timer must be cancelled
        assert.equal(
            moveDebounceTimers.has(socket.id),
            false,
            "Pending debounce timer must be cleared on disconnect"
        );

        // 2. Memory must be cleared
        assert.equal(
            players[socket.id],
            undefined,
            "Player must be removed from server.js players map"
        );

        // 3. Disconnect must be broadcast
        const discBroadcast = socket.broadcastEmitted.find(
            (e) => e.event === "player-disconnected"
        );
        assert.ok(discBroadcast, "Must broadcast player-disconnected");

        // 4. Verify call order: UPDATE final position [480, 520] must happen BEFORE DELETE
        assert.equal(callLog.length, 2);
        assert.equal(callLog[0].type, "UPDATE");
        assert.deepEqual(callLog[0].args[1].$set.position, [480, 520]);
        assert.equal(callLog[1].type, "DELETE");
        assert.equal(callLog[1].args[0].playerId, socket.id);

        // 5. Verify that after the original debounce delay, NO late/zombie write occurs
        await new Promise((r) => setTimeout(r, DB_DEBOUNCE_MS + 50));
        assert.equal(
            callLog.length,
            2,
            "No additional database writes must occur after disconnect"
        );
    } finally {
        Player.updateOne = origUpdateOne;
        Player.deleteOne = origDeleteOne;
        delete players[socket.id];
        moveDebounceTimers.delete(socket.id);
        inFlightWrites.delete(socket.id);
        disconnectedSockets.delete(socket.id);
    }
});

// ---------------------------------------------------------------------
// TEST SUITE 6: In-Flight Write Race Condition Guard on Disconnect
// ---------------------------------------------------------------------
test("Actual Server Handler - Disconnect awaits in-flight writes before deleteOne", async () => {
    const origDeleteOne = Player.deleteOne;
    const callOrder = [];
    let resolveInFlightWrite;

    const inFlightPromise = new Promise((resolve) => {
        resolveInFlightWrite = () => {
            callOrder.push("IN_FLIGHT_RESOLVED");
            resolve();
        };
    });

    Player.deleteOne = async (...args) => {
        callOrder.push("DELETE_ONE_EXECUTED");
        return { acknowledged: true };
    };

    const socket = createMockSocket("socket-inflight-test");

    try {
        handleConnection(socket);

        // Register the active in-flight write in server.js
        inFlightWrites.set(socket.id, inFlightPromise);

        // Trigger disconnect while write is still pending
        const [disconnectHandler] = socket.listeners("disconnect");
        const disconnectPromise = disconnectHandler();

        // Small delay while in-flight write is still unresolved
        await new Promise((r) => setTimeout(r, 30));

        // deleteOne must NOT have executed yet because it awaits inFlightWrites!
        assert.equal(
            callOrder.includes("DELETE_ONE_EXECUTED"),
            false,
            "deleteOne must wait for in-flight write to resolve"
        );

        // Now resolve the in-flight write
        resolveInFlightWrite();

        // Await disconnect handler to complete
        await disconnectPromise;

        // Verify order: IN_FLIGHT_RESOLVED happened BEFORE DELETE_ONE_EXECUTED
        assert.deepEqual(callOrder, [
            "IN_FLIGHT_RESOLVED",
            "DELETE_ONE_EXECUTED",
        ]);
    } finally {
        Player.deleteOne = origDeleteOne;
        delete players[socket.id];
        moveDebounceTimers.delete(socket.id);
        inFlightWrites.delete(socket.id);
        disconnectedSockets.delete(socket.id);
    }
});

// ---------------------------------------------------------------------
// TEST SUITE 7: Mongoose Player Schema & 2D Index Verification
// ---------------------------------------------------------------------
test("Mongoose Player Schema - Uses position [x, y] with 2d index and no location/2dsphere", () => {
    // 1. position field exists and is configured as array
    const positionPath = Player.schema.path("position");
    assert.ok(positionPath, "Player schema must have 'position' field");
    assert.equal(positionPath.instance, "Array");

    // 2. x and y fields are retained
    const xPath = Player.schema.path("x");
    const yPath = Player.schema.path("y");
    assert.ok(xPath, "x field must exist");
    assert.ok(yPath, "y field must exist");

    // 3. location field is removed
    const locationPath = Player.schema.path("location");
    assert.equal(
        locationPath,
        undefined,
        "Obsolete 'location' field must be removed from schema"
    );

    // 4. Verify schema indexes: position: '2d' must be present, location: '2dsphere' must NOT be present
    const indexes = Player.schema.indexes();
    const has2dIndex = indexes.some(
        ([fields]) => fields && fields.position === "2d"
    );
    const has2dsphereIndex = indexes.some(
        ([fields]) => fields && fields.location === "2dsphere"
    );

    assert.equal(
        has2dIndex,
        true,
        "Player schema must define 2d index on 'position'"
    );
    assert.equal(
        has2dsphereIndex,
        false,
        "Player schema must NOT define 2dsphere index"
    );
});

// Teardown: ensure any active Mongoose connection or open handles are closed
test.after(async () => {
    Player.findOneAndUpdate = origFindOneAndUpdate;
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
});

