# 06 - Progress Log (Abhay, abhay-team-lead)

> Update this every night before pushing. The AI reads it at the start of each session.

## Current status
- Current day: Day 3 (Mon 12 Oct 2026)
- Current task (from 02_TEAM_PLAN.md): feat: join event, in-memory users, broadcast users:list
- Blockers: none

## Daily entries

### Day 1 - Sat 10 Oct 2026
- Planned: chore: create repo, folders client/server, .gitignore, verify 4 member branches, connect dashboard
- Done: Project structure initialized with client/server folders, context documentation, and gitignore.
- Files changed: README.md, docs/context/*, .gitignore, .env.example
- Commit message(s): chore: add client and server structure with .gitkeep
- Problems / fixes: None
- Tomorrow (Day 2): Socket.io server with connect and disconnect logs

### Day 2 - Sun 11 Oct 2026
- Planned: feat: Socket.io server with connect and disconnect logs
- Done: Scaffolded Express & Socket.io server with CORS, health check endpoint, and connection/disconnection logs.
- Files changed: server/package.json, server/src/server.js, server/.env
- Commit message(s): feat: Socket.io server with connect and disconnect logs
- Problems / fixes: None
- Tomorrow (Day 3): User join event, in-memory users tracking, broadcast users:list

### Day 3 - Mon 12 Oct 2026
- Planned: feat: join event, in-memory users, broadcast users:list
- Done: Created in-memory user manager service and wired `join`, `users:list`, `user:joined`, and `user:left` events in Socket.io handler.
- Files changed: server/src/services/userManager.js, server/src/sockets/socketHandler.js
- Commit message(s): feat: join event, in-memory users, broadcast users:list
- Problems / fixes: None
- Tomorrow (Day 4): feat: move event broadcasts x/y to everyone

### Day 4 - Tue 13 Oct 2026 (Kajal, kajal-backend)
- Planned: debounced position save to MongoDB, verify index
- Done:
  - Replaced GeoJSON `location` field and `2dsphere` index with flat `position: [x, y]` and `2d` geospatial index in Player model
  - Created `server/utils/validation.js` with defensive coordinate validation for 1000x600 canvas boundaries
  - Updated `server/server.js` to broadcast movements in real-time while debouncing MongoDB writes by 1000ms per player
  - Handled disconnect safely: cancel pending debounce timer, persist latest position if pending, delete player record, and guard against delayed async operations recreating deleted records
  - Guarded database connection on server import to prevent test runner hanging and unreferenced disconnect cleanup timers
  - Added inFlightWrites tracking to guarantee in-flight operations complete before deleteOne runs on disconnect
  - Added automated test suite in `server/test/debounce-index.test.js` with 9 passing tests verifying actual server handlers and race-condition guards
- Files changed:
  - `server/models/Player.js`
  - `server/utils/validation.js`
  - `server/server.js`
  - `server/scripts/migrate-indexes.js`
  - `server/test/debounce-index.test.js`
  - `server/package.json`
  - `docs/context/06_PROGRESS_LOG.md`
- Commit message(s): feat: debounced position save to MongoDB, verify index
- Problems / fixes: Resolved test hanging by modularizing validation into `utils/validation.js`, wrapping database connection inside `connectDB()` executed only on direct startup, and adding `.unref()` to disconnect timers. Eliminated race conditions between in-flight writes and deleteOne by tracking and awaiting in-flight promises.
### Day 5 - Wed 14 Oct 2026 (Kajal, kajal-backend)
- Planned: test: script spawning fake socket clients
- Done:
  - Created `server/scripts/fake-clients.js` to spawn configurable fake Socket.IO clients connecting to the real backend (`http://localhost:5000`)
  - Added `socket.io-client` as a development dependency in `server/package.json`
  - Added npm command `"test:clients"` running `node scripts/fake-clients.js`
  - Supported configurable parameters via CLI flags and environment variables: client count (default: 5), duration (default: 5000ms), movement interval (default: 250ms), connect timeout, and server URL
  - Simulated bounded avatar movement within 1000x600 canvas coordinates using `isValidCoordinate`
  - Tracked connection lifecycle, `player-move` events emitted, and incoming Socket.IO broadcasts (`player-moved`, `player-joined`, `player-disconnected`)
  - Implemented clean shutdown disconnecting every client and clearing all timers and intervals
  - Handled connection errors and server unavailability cleanly without hanging
- Files changed:
  - `server/scripts/fake-clients.js`
  - `server/package.json`
  - `server/package-lock.json`
  - `docs/context/06_PROGRESS_LOG.md`
- Commit message(s): test: script spawning fake socket clients
- Problems / fixes: Implemented connection timeout watchdog and error handling so the script exits with code 1 if the server is offline rather than hanging indefinitely. Verified real-network execution with live server (5 clients connected, 55 moves emitted, 220 broadcasts received, 0 errors, clean disconnects), verified unavailable server handling (clean exit with code 1), and verified all 9 existing unit tests pass.
- Tomorrow (Day 6): docs: socket events list and DB schema in README

<!-- Copy the block above for each new day. -->

## Viva notes (add as you go)
- What each file does in simple words:
  - `server/src/server.js`: Starts Express HTTP and Socket.io server, applies CORS, and parses JSON.
  - `server/src/sockets/socketHandler.js`: Central Socket.io hub that listens to connection, join, and disconnect events.
  - `server/src/services/userManager.js`: Fast in-memory Map storing connected active users (socketId, username, position [x, y]).
  - `server/models/Player.js`: Defines the Mongoose schema for players with `playerId`, `x`, `y`, `position: [x, y]`, and a `2d` geospatial index.
  - `server/utils/validation.js`: Contains canvas boundary limits (1000x600), debounce timing constants, and coordinate validation to protect against NaN, strings, and out-of-bounds positions.
  - `server/server.js`: Express and Socket.IO server handling player connections, real-time broadcasts, debounced writes to MongoDB, and safe disconnect cleanup.
  - `server/scripts/migrate-indexes.js`: Standalone migration script that safely inspects existing MongoDB indexes, drops the obsolete `location_2dsphere` index if present, and creates the `position_2d` index without touching player records.
  - `server/scripts/fake-clients.js`: Standalone test script spawning configurable concurrent Socket.IO clients to verify real-time movement and broadcast stability.
  - `server/test/debounce-index.test.js`: Automated test suite verifying validation, debounced persistence, disconnect cleanup, and schema index definitions.
- Key decisions and why (2d index, debouncing, disconnect cleanup, in-memory map):
  - **In-memory Map**: Used for live connected users to avoid querying MongoDB on every movement event or lookup, maintaining sub-millisecond real-time performance.
  - **2D index vs 2dsphere**: The office is a flat 1000x600 pixel grid. `2dsphere` is for Earth coordinates and spherical trigonometry, whereas `2d` index works directly with flat Cartesian coordinates and Euclidean distance (`$near` with `$maxDistance: 100` pixels).
  - **Debouncing**: Avatars move at 30-60 updates per second. Writing to MongoDB on every event would cause thousands of writes per second and ruin our 20ms response time target. Debouncing saves only after 1 second of stillness, reducing database load by over 95%.
  - **Disconnect safety**: When a user leaves, we cancel pending debounce timers, save the latest position if needed, delete the database record, and guard with `disconnectedSockets` so asynchronous callbacks can never resurrect a deleted player.
- Questions I should be ready for:
  - *Why keep live coordinates in memory instead of reading from DB?* Database roundtrips add 5-20ms latency and high I/O overhead; in-memory lookup is sub-millisecond.
  - *Why not write to MongoDB on every move?* Because WebSocket broadcast must happen immediately (zero latency, 60 FPS), but disk/network DB I/O would bottleneck the system under multi-user load.
  - *Does changing Mongoose schema delete the old index in MongoDB?* No, Mongoose only creates indexes; obsolete database indexes must be dropped explicitly using a migration script or mongosh.

## Done checklist
- [ ] Week 1 merged to main
- [ ] Week 2 merged, tag v0.2-mid
- [ ] Mid review ready (docs, benchmarks, video)
- [ ] Week 3 merged, tag v0.3
- [ ] Week 4 merged, deployed, tag v1.0
- [ ] Final review ready (report, PPT, video)
