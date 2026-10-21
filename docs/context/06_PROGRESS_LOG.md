06 - Progress Log (Abhay, abhay-team-lead)

Update this every night before pushing. The AI reads it at the start of each session.

## Current status
- Current day: Day 12 (Wed 21 Oct 2026) - synchronized with origin/main
- Current task (from 02_TEAM_PLAN.md): test: spatial audit script, results to docs/benchmarks.md
- Blockers: none

## Daily entries

Day 1 - Sat 10 Oct 2026

Planned: chore: create repo, folders client/server, .gitignore, verify 4 member branches, connect dashboard

Done: Project structure initialized with client/server folders, context documentation, and gitignore.

Files changed: README.md, docs/context/*, .gitignore, .env.example

Commit message(s): chore: add client and server structure with .gitkeep

Problems / fixes: None

Tomorrow (Day 2): Socket.io server with connect and disconnect logs

Day 2 - Sun 11 Oct 2026

Planned: feat: Socket.io server with connect and disconnect logs

Done: Scaffolded Express & Socket.io server with CORS, health check endpoint, and connection/disconnection logs.

Files changed: server/package.json, server/src/server.js, server/.env

Commit message(s): feat: Socket.io server with connect and disconnect logs

Problems / fixes: None

Tomorrow (Day 3): User join event, in-memory users tracking, broadcast users

Day 3 - Mon 12 Oct 2026

Planned: feat: join event, in-memory users, broadcast users

Done: Created in-memory user manager service and wired join, users, user, and user events in Socket.io handler.

Files changed: server/src/services/userManager.js, server/src/sockets/socketHandler.js

Commit message(s): feat: join event, in-memory users, broadcast users

Problems / fixes: None

Day 4 - Tue 13 Oct 2026

Planned: feat: move event broadcasts x/y to everyone; debounced position save to MongoDB, verify index

Done:

Replaced GeoJSON location field and 2dsphere index with flat Cartesian position: [x, y] and 2d geospatial index in Mongoose Player model.

Implemented real-time position broadcast via WebSockets (move / player-move -> user / player-moved) with zero DB latency for 60 FPS movement.

Debounced MongoDB writes (1000ms delay per player) in persistenceManager service to reduce write overhead by over 95%.

Added race-condition guards on player disconnect: clears pending debounce timers, persists latest position if pending, awaits in-flight writes, and removes document.

Added index migration script in server/src/scripts/migrate-indexes.js to ensure the position_2d index exists and remove legacy location_2dsphere.

Added automated test suite in server/test/persistence.test.js verifying schema indexes, coordinate clamping, and debounce/disconnect guards.

Files changed: server/src/models/Player.js, server/src/services/persistenceManager.js, server/src/sockets/socketHandler.js, server/src/scripts/migrate-indexes.js, server/test/persistence.test.js

Commit message(s): feat: move event broadcast and debounced position save to MongoDB

Problems / fixes: Integrated Kajal's database persistence, debouncing logic, and migration tools into the modular ES Module server architecture.

Tomorrow (Day 5): feat: render remote avatars with interpolation, test: script spawning fake socket clients

Day 4 - Tue 13 Oct 2026 (Kajal, kajal-backend)

Planned: debounced position save to MongoDB, verify index

Done:

Replaced GeoJSON location field and 2dsphere index with flat position: [x, y] and 2d geospatial index in Player model.

Created server/utils/validation.js with defensive coordinate validation for 1000x600 canvas boundaries.

Updated server/server.js to broadcast movements in real-time while debouncing MongoDB writes by 1000ms per player.

Handled disconnect safely: cancel pending debounce timer, persist latest position if pending, delete player record, and guard against delayed async operations recreating deleted records.

Guarded database connection on server import to prevent test runner hanging and unreferenced disconnect cleanup timers.

Added inFlightWrites tracking to guarantee in-flight operations complete before deleteOne runs on disconnect.

Added automated test suite in server/test/debounce-index.test.js with 9 passing tests verifying actual server handlers and race-condition guards.

Files changed:

server/models/Player.js

server/utils/validation.js

server/server.js

server/scripts/migrate-indexes.js

server/test/debounce-index.test.js

server/package.json

docs/context/06_PROGRESS_LOG.md

Commit message(s): feat: debounced position save to MongoDB, verify index

Problems / fixes: Resolved test hanging by modularizing validation into utils/validation.js, wrapping database connection inside connectDB() executed only on direct startup, and adding .unref() to disconnect timers. Eliminated race conditions between in-flight writes and deleteOne by tracking and awaiting in-flight promises.

Day 5 - Wed 14 Oct 2026 (Kajal, kajal-backend)

Planned: test: script spawning fake socket clients

Done:

Created server/scripts/fake-clients.js to spawn configurable fake Socket.IO clients connecting to the real backend (http://localhost:5000).

Added socket.io-client as a development dependency in server/package.json.

Added npm command "test" running node scripts/fake-clients.js.

Supported configurable parameters via CLI flags and environment variables: client count (default: 5), duration (default: 5000ms), movement interval (default: 250ms), connect timeout, and server URL.

Simulated bounded avatar movement within 1000x600 canvas coordinates using isValidCoordinate.

Tracked connection lifecycle, player-move events emitted, and incoming Socket.IO broadcasts (player-moved, player-joined, player-disconnected).

Implemented clean shutdown disconnecting every client and clearing all timers and intervals.

Handled connection errors and server unavailability cleanly without hanging.

Files changed:

server/scripts/fake-clients.js

server/package.json

server/package-lock.json

docs/context/06_PROGRESS_LOG.md

Commit message(s): test: script spawning fake socket clients

Problems / fixes: Implemented connection timeout watchdog and error handling so the script exits with code 1 if the server is offline rather than hanging indefinitely. Verified real-network execution with live server (5 clients connected, 55 moves emitted, 220 broadcasts received, 0 errors, clean disconnects), verified unavailable server handling (clean exit with code 1), and verified all 9 existing unit tests pass.

Day 6 - Thu 15 Oct 2026 (Kajal, kajal-backend)

Planned: docs: socket events list and DB schema in README

Done:
- Documented all Socket.IO events (join, users:list, user:joined, move, player-move, user:moved, player-moved, disconnect, user:left, player-disconnected) with direction, payload schemas, and server side-effects.
- Documented MongoDB Player schema, fields, types, and flat [x, y] position array with 2D Cartesian index ({ position: "2d" }).
- Documented coordinate validation rules and persistence lifecycle (debouncing at 1000ms, in-flight write locks, and safe disconnect cleanup).
- Recorded changes in README.md, verified against implementation and tests, and committed to kajal-backend.

Files changed: README.md

Commit message(s): docs: add socket events and database schema to README

Problems / fixes: Verified documentation consistency against server/server.js, server/models/Player.js, and server/utils/validation.js.

Tomorrow (Day 7): docs: DB schema notes, fix bugs found

Day 7 - Fri 16 Oct 2026 (Kajal, kajal-backend)

Planned: docs: DB schema notes, fix bugs found

Done:
- Created comprehensive database schema and geospatial persistence notes in docs/database-schema.md covering architecture, schema definitions, 2D vs 2dsphere indexing, concurrency guards, and viva voce preparation.
- Fixed MongoDB URI fallback bug in server/src/config/db.js and server/src/scripts/migrate-indexes.js to support both MONGODB_URI and MONGO_URI.
- Fixed isDbConnected() race condition during server startup to recognize readyState 2 (connecting), ensuring Mongoose command buffering preserves initial player join records.
- Added explicit playerId to $set during player join upsert in persistenceManager.js.
- Added defensive validation against non-finite or invalid coordinates (NaN, Infinity, strings) in scheduleDebouncedMove and persistPlayerDisconnect to protect the MongoDB 2d index.
- Added mongoose.models.Player safeguard in server/models/Player.js to prevent OverwriteModelError and added username field for schema parity.
- Added post-migration verification in server/src/scripts/migrate-indexes.js.
- Expanded backend unit test suite in server/test/persistence.test.js with tests for defensive coordinate filtering and username schema validation; all 14 tests passing.

Files changed:
- docs/database-schema.md
- server/src/config/db.js
- server/src/services/persistenceManager.js
- server/models/Player.js
- server/src/scripts/migrate-indexes.js
- server/test/persistence.test.js
- docs/context/06_PROGRESS_LOG.md

Commit message(s): docs: DB schema notes, fix bugs found

Problems / fixes: Cleaned up leftover merge conflict markers and duplicated viva notes in docs/context/06_PROGRESS_LOG.md. All 14 unit tests pass with zero regressions.

Tomorrow (Day 8): feat: getNearbyUsers() using $near, 100px

Day 8 - Sat 17 Oct 2026 (Kajal, kajal-backend)

Planned: feat: getNearbyUsers() using $near, 100px

Done:
- Implemented and exported getNearbyUsers() in server/src/services/persistenceManager.js using MongoDB's legacy 2d index on position with $near and a default 100-pixel radius.
- Enforced input validation for origin coordinates ([x, y] or {x, y}), maxDistance, and candidate user coordinates to reject invalid/non-finite values (NaN, Infinity, strings, negative radius).
- Excluded requesting user from proximity results at both database level (playerId: { $ne: excludePlayerId }) and in-memory level (matching socketId, playerId, and id).
- Added in-memory fallback using Euclidean distance calculation when MongoDB is disconnected or if the query fails, preserving non-blocking operation without circular imports.
- Ensured results are returned in ascending distance order (closest first) in both database and in-memory paths.
- Added comprehensive offline unit tests in server/test/persistence.test.js covering $near query shape, requester exclusion, boundary distance filtering (inside, exactly on, outside 100px), distance ordering, invalid coordinates, offline fallback, and error recovery. All 20 tests pass.

Files changed:
- server/src/services/persistenceManager.js
- server/test/persistence.test.js
- docs/context/06_PROGRESS_LOG.md

Commit message(s): feat: getNearbyUsers() using $near, 100px

Problems / fixes: Handled property naming differences (playerId vs socketId) across layers defensively and ensured fallback array handling is completely decoupled from userManager.js imports.

Tomorrow (Day 9): feat: cluster users into groups (connected components)

Day 9 - Sun 18 Oct 2026 (Kajal, kajal-backend)

Planned: feat: cluster users into groups (connected components)

Done:
- Implemented and exported clusterUsers() (and alias clusterUsersIntoGroups()) in server/src/services/persistenceManager.js using Breadth-First Search (BFS) to find connected components in an undirected proximity graph.
- Applied the 100-pixel proximity rule: an edge exists between two users if Euclidean distance <= 100px.
- Guaranteed transitivity: if A is within 100px of B, and B is within 100px of C, all three belong to the same group/cluster even if A and C are > 100px apart.
- Handled edge cases: empty input returns [], single-user input returns [[user]], invalid/malformed entries and coordinates are safely skipped, and duplicate users are deduplicated.
- Added comprehensive offline unit tests in server/test/persistence.test.js covering empty/null inputs, single users, directly connected pairs, disconnected pairs, transitive chains, multi-cluster partitions with isolated users, deduplication, and custom maxDistance thresholds. All 28 tests passing.

Files changed:
- server/src/services/persistenceManager.js
- server/test/persistence.test.js
- docs/context/06_PROGRESS_LOG.md

Commit message(s): feat: cluster users into groups (connected components)

Problems / fixes: Ensured zero circular imports by accepting users collection as an argument, and normalized user identifiers across socketId, playerId, and id.

Tomorrow (Day 10): feat: emit nearby:enter and nearby:leave diffs

Day 10 - Mon 19 Oct 2026 (Kajal, kajal-backend)

Planned: feat: emit nearby:enter and nearby:leave diffs

Done:
- Implemented stateful user proximity tracking in `server/src/services/persistenceManager.js` using `userNearbyMap` (socketId -> Set<peerSocketId>) to record previously known nearby peers within the 100px threshold.
- Implemented `updateProximity(socketId, user, currentNearby)` to calculate `entered` (new peers within 100px) and `left` (peers no longer within 100px) diffs.
- Maintained symmetric proximity relationships (A near B <=> B near A) so that movement of either player updates both peers' internal tracking sets, preventing duplicate `nearby:enter` emissions on subsequent moves.
- Implemented `cleanupProximityOnDisconnect(socketId)` to purge disconnected sockets from internal state, clean up peer tracking sets, and return affected peers without emitting to the disconnected socket.
- Normalized `socketId` and `playerId` in `getNearbyUsers()` so MongoDB query documents and fallback candidate objects provide uniform identifier access.
- Validated candidate IDs returned by `getNearbyUsers()` against active in-memory sockets in `userManager` before emitting `nearby:enter` / `nearby:leave`, ensuring offline or stale database records are never treated as connected WebRTC peers.
- Added query optimization in `queueProximityCheck`: bypassed queries when the user is alone in the room (`getUserCount() <= 1`) or when movement coordinates are unchanged, preserving database and compute resources.
- Guarded against asynchronous race conditions on rapid movement using a per-socket FIFO queue with intermediate position coalescing, guaranteeing that queries execute sequentially and evaluate the latest position without out-of-order state corruption.
- Integrated proximity diff detection into `server/src/sockets/socketHandler.js` on `join` and `move`/`player-move` events while keeping 60 FPS movement broadcast synchronous and instantaneous.
- Emitted `nearby:enter` ({ socketId, id, username, x, y }) to both entering sockets and `nearby:leave` ({ socketId, id }) to both leaving sockets only when the proximity boundary is crossed.
- Added 9 comprehensive automated tests in `server/test/persistence.test.js` covering enter diff, leave diff, unchanged proximity suppression, disconnect cleanup, active socket filtering against stale DB records, query bypassing for solo/unchanged positions, rapid movement queue serialization, and the full Socket.IO lifecycle with mock sockets. All 37 tests pass.

Files changed:
- server/src/services/persistenceManager.js
- server/src/sockets/socketHandler.js
- server/test/persistence.test.js
- docs/context/06_PROGRESS_LOG.md

Commit message(s): feat: emit nearby:enter and nearby:leave diffs

Problems / fixes: Resolved asynchronous race conditions on rapid movement by implementing a per-socket promise queue that coalesces intermediate positions; eliminated phantom WebRTC peer attempts by validating candidate IDs from MongoDB against currently active connected sockets in userManager; avoided redundant queries when alone or stationary.

Tomorrow (Day 11): perf: query timing logger

Day 11 - Tue 20 Oct 2026 (Kajal, kajal-backend)

Planned: perf: query timing logger

Done:
- Created high-resolution query timing service in `server/src/services/queryTimer.js` using `performance.now()` to measure proximity query execution times in milliseconds.
- Enforced strict credential and secret sanitization (`sanitizeLogData`) to redact MongoDB URIs (`mongodb://...`), passwords, API tokens, and credentials from all logged query records.
- Configured target threshold tracking against the project target of 20ms (`TARGET_QUERY_TIME_MS = 20`) with automatic alert logging (`[PERF ALERT - SLOW]`) for queries exceeding 20ms.
- Integrated `measureQuery()` into `server/src/services/persistenceManager.js` inside `getNearbyUsers()` for both MongoDB `$near` queries (source: `"mongodb"`) and in-memory fallback calculations (source: `"in-memory"`).
- Maintained ring buffer of recent query timings (`getRecentQueries()`) and computed aggregate statistics (`getQueryStats()`: totalQueries, avgDurationMs, minDurationMs, maxDurationMs, slowQueryCount, targetMetRate, bySource breakdown).
- Exported `resetQueryStats()` and `getLastQueryTiming()` for easy inspection in unit tests and future benchmark audits.
- Added 7 dedicated automated unit tests in `server/test/persistence.test.js` verifying secret scrubbing, execution measurement, target compliance, multi-source aggregation, automatic logging in `getNearbyUsers()`, clean stat resets, exact 20ms boundary enforcement, and modern socket event protocol compliance. All 45 tests pass.
- Aligned active client (`client/src/VirtualOffice.jsx`) and server (`server/src/sockets/socketHandler.js`, `server/server.js`) to the modern socket event protocol:
  - Client emits `move` (replaced legacy `player-move`).
  - Removed legacy client listeners for `current-players`, `player-joined`, `player-moved`, and `player-disconnected`.
  - Server movement listener now listens to `move` only.
  - Server broadcasts use modern events exclusively: `users:list`, `user:joined`, `user:moved`, and `user:left`.
  - Updated `server/scripts/fake-clients.js` and `server/src/scripts/fake-clients.js` to emit `move` and listen to modern events.
  - Updated test assertions in `server/test/debounce-index.test.js` and added dedicated modern event assertion test in `server/test/persistence.test.js`.
  - Preserved all Day 8–11 functionality (getNearbyUsers 100px threshold, clusterUsers, nearby:enter/leave, queryTimer, and debounced 2d index persistence).

Files changed:
- client/src/VirtualOffice.jsx
- server/src/sockets/socketHandler.js
- server/server.js
- server/scripts/fake-clients.js
- server/src/scripts/fake-clients.js
- server/test/debounce-index.test.js
- server/test/persistence.test.js
- README.md
- docs/context/06_PROGRESS_LOG.md

Commit message(s): refactor: align client and server with modern socket event protocol

Problems / fixes: Removed legacy event aliases across client, server, and test suites after confirming all components use modern events (users:list, user:joined, move, user:moved, user:left), maintaining full compatibility with WebRTC proximity diffs and 60 FPS interpolation.

Tomorrow (Day 12): perf: cache and index tuning to get under 20 ms

Day 12 - Wed 21 Oct 2026 (Kajal, kajal-backend)

Planned: perf: cache and index tuning to get under 20 ms

Done:
- Profiled proximity query performance: identified that querying MongoDB `$near` during 60 FPS movement suffered from both latency overhead (network roundtrip, BSON serialization) and stale data (since movement writes are debounced by 1000ms).
- Implemented dedicated in-memory spatial proximity query `getNearbyUsersInMemory(origin, options)` in `server/src/services/persistenceManager.js`:
  - Enforces 100-pixel Euclidean distance by default.
  - Correctly includes candidates on the exact 100px boundary (`distSq <= maxDistSq`).
  - Supports requester exclusion (`excludePlayerId`).
  - Implements defensive coordinate validation for origin and candidate users.
  - Sorts matches nearest-first (ascending distance).
  - Normalizes `socketId`, `id`, and `playerId`.
  - Integrates transparently with `measureQuery()` to track query duration in `queryTimer.js`.
- Connected `runProximityDiff()` in `server/src/sockets/socketHandler.js` directly to `getNearbyUsersInMemory()`, eliminating stale database reads and achieving sub-millisecond query latency across 10, 25, 50, 100, and 200 users (p95 latency ranges from 0.0068ms to 0.0304ms, beating the 20ms target by over 650x).
- Preserved existing `getNearbyUsers()` and MongoDB 2D geospatial index intact.
- Added 5 regression tests in `server/test/persistence.test.js` covering 100px boundary inclusion, exact boundary inclusion vs exclusion, defensive parameter validation, automated userManager querying with `queryTimer` compliance, and pure in-memory execution during active Socket.IO movement. All 50 tests pass.
- Verified empirical benchmarks: 10,000 iterations per user tier (10, 25, 50, 100, 200 users) confirming 100% compliance with strict < 20ms performance target.

Files changed:
- server/src/services/persistenceManager.js
- server/src/sockets/socketHandler.js
- server/test/persistence.test.js
- docs/context/06_PROGRESS_LOG.md

Commit message(s): perf: in-memory proximity query optimization for <20ms target

Problems / fixes: Avoided query race conditions by using live positions from userManager rather than debounced MongoDB positions, while keeping getNearbyUsers() and 2d index available for database sync and persistence audits.

Tomorrow (Day 13): test: spatial audit script, results to docs/benchmarks.md

Day 13 - Thu 22 Oct 2026 (Kajal, kajal-backend)

Planned: test: spatial audit script, results to docs/benchmarks.md

Done:
- Created standalone automated spatial audit script `server/src/scripts/spatial-audit.js` and runner `server/scripts/spatial-audit.js`:
  - Audits distance boundaries with sub-pixel exactness: verifies inclusion at <= 100px (origin, 50px, 99.99px, exact 100.0px on axes, and exact Pythagorean diagonal [560, 580]) and strict exclusion at >= 100.01px.
  - Audits requester exclusion across socket IDs, player IDs, and numeric/string identifier coercion.
  - Audits defensive handling for NaN, Infinity, -Infinity, corrupt candidate objects, and invalid/negative radii.
  - Audits result correctness and nearest-first ascending distance ordering.
  - Audits graph clustering transitivity across connected and isolated components.
  - Benchmarks execution time over 5,000 iterations across 10, 25, 50, 100, and 200 users, confirming p95 latency is well under the 20ms target (p95 = 0.0091ms at 50 users, 0.0346ms at 200 users).
- Added `audit:spatial` script to `server/package.json` (`npm run audit:spatial`).
- Authored comprehensive benchmarks and methodology documentation in `docs/benchmarks.md` including mathematical formulation, 2D Cartesian plane vs 2dsphere index justification, test scenario matrix, empirical latency tables, and architecture notes.
- Added 5 unit tests in `server/test/persistence.test.js` validating the audit assertions. Test suite now stands at 55 passing tests (0 failures).

Files changed:
- server/src/scripts/spatial-audit.js
- server/scripts/spatial-audit.js
- server/package.json
- docs/benchmarks.md
- server/test/persistence.test.js
- docs/context/06_PROGRESS_LOG.md

Commit message(s): test: spatial audit script, results to docs/benchmarks.md

Problems / fixes: Handled ES module import vs direct CLI invocation cleanly in spatial-audit runner; verified 100% test pass rate across Node test suite.

Tomorrow (Day 14): docs: benchmark results table

<!-- Copy the block above for each new day. -->

Viva notes (add as you go)

What each file does in simple words:

- server/src/server.js: Starts the Express HTTP and Socket.IO server, applies CORS, and parses JSON.
- server/src/sockets/socketHandler.js: Central Socket.IO handler for connections, join events, movement broadcasts, disconnect events, and `nearby:enter` / `nearby:leave` proximity diff emissions.
- server/src/services/userManager.js: Maintains an in-memory Map of connected users, including socket ID, username, and position [x, y].
- server/src/services/persistenceManager.js: Handles debounced MongoDB persistence, in-flight write tracking, safe disconnect cleanup, `getNearbyUsers()`, `getNearbyUsersInMemory()`, `clusterUsers()`, and proximity diff tracking (`updateProximity`, `cleanupProximityOnDisconnect`).
- server/src/services/queryTimer.js: Measures execution time of geospatial proximity queries, formats secret-safe logs, tracks performance against the <=20ms target, and aggregates latency metrics.
- server/src/scripts/spatial-audit.js: Standalone spatial audit suite verifying distance boundaries, requester exclusion, defensive coordinates, result correctness, and latency benchmarks across 10-200 users.
- docs/benchmarks.md: Technical documentation detailing spatial audit methodology, mathematical formulation, test scenario matrix, and empirical benchmark tables.
- server/src/models/Player.js: Defines the Mongoose Player schema with Cartesian position: [x, y] and a 2d geospatial index.
- server/models/Player.js: Legacy Player model used by the existing CommonJS backend.
- server/utils/validation.js: Validates coordinates against the 1000x600 canvas boundaries and protects against invalid or out-of-range values.
- server/server.js: Legacy Express and Socket.IO server handling movement broadcasts, debounced MongoDB writes, and disconnect cleanup.
- server/scripts/migrate-indexes.js: Legacy index migration script for managing MongoDB geospatial indexes.
- server/src/scripts/migrate-indexes.js: ES-module migration script for inspecting, updating, and verifying MongoDB geospatial indexes.
- server/scripts/fake-clients.js: Spawns configurable Socket.IO clients to test concurrent connections, movement broadcasts, and disconnect behavior.
- server/test/debounce-index.test.js: Tests coordinate validation, debounced persistence, disconnect cleanup, and schema index definitions.
- server/test/persistence.test.js: Tests schema indexes, coordinate clamping, defensive coordinate validation, getNearbyUsers, clusterUsers, proximity diff tracking, and query timing metrics.
- docs/database-schema.md: Comprehensive technical notes covering the database schema, 2D vs 2dsphere indexing, and persistence concurrency guards.

Key decisions and why (2d index, debouncing, disconnect cleanup, in-memory map):

- In-memory Map: Keeps connected users' current positions available in sub-millisecond memory lookups without querying MongoDB for every movement update.
- 2D index vs. 2dsphere: The virtual office is a flat 1000x600 pixel grid. A 2d index is appropriate for Cartesian coordinates and direct Euclidean pixel distance ($near with $maxDistance: 100), while 2dsphere is designed for geographic spherical coordinates.
- Debouncing: Movement updates are broadcast immediately over WebSockets (zero DB lag for 60 FPS), while MongoDB writes are delayed by 1000ms to reduce database I/O by >95%.
- Disconnect safety: Pending timers are cleared, in-flight writes are awaited where necessary, and asynchronous operations are guarded with a tombstone set (disconnectedSockets) to prevent deleted player records from being resurrected.
- Proximity Diffs (`nearby:enter` / `nearby:leave`): WebRTC peer connections are computationally and bandwidth intensive. Instead of spamming proximity lists or connecting all peers, the server calculates proximity diffs only when users enter or leave the 100px earshot. Symmetrically updating both peers prevents redundant offer/answer negotiations.
- Query Timing Logger: The project mandates that spatial queries complete under 20ms to handle 50+ concurrent users without degrading real-time audio signaling. High-resolution timing via performance.now() tracks whether queries meet this target, alerts on slow queries, and provides data for Day 13 spatial audit benchmarks while scrubbing credentials and connection strings from logs.
- Movement interpolation: Remote avatar positions are interpolated between received updates to make movement appear smoother.
- Socket.IO compatibility: The client listens for both legacy and newer event names to interoperate smoothly with both server implementations.

Questions I should be ready for:

- Why keep live coordinates in memory instead of reading from the database? In-memory access avoids a database round trip for every real-time movement update, keeping latency under 20ms.
- Why not write to MongoDB on every move? Frequent database writes would saturate disk and network I/O during rapid movement. Debouncing reduces overhead while keeping movement broadcasts responsive.
- Does changing a Mongoose schema automatically delete an old database index? No. Obsolete indexes must be removed explicitly through a migration script (collection.dropIndex) or database command.
- Why use a 2d index instead of a 2dsphere index? The virtual office uses flat pixel coordinates rather than geographic spherical coordinates.
- How do you prevent zombie records on disconnect? By registering the socket in a disconnectedSockets tombstone set and awaiting active in-flight writes before issuing deleteOne.
- How do you detect when a user enters or leaves the 100px earshot without sending duplicate events? We maintain a set of previously nearby peer IDs for each socket in `userNearbyMap`. When a user moves or joins, we query nearby users within 100px and compute the set difference (`entered = current \ previous`, `left = previous \ current`). If a user moves but stays within 100px of the same peers, both diff sets are empty, so no events are emitted.
- What happens when a user disconnects? The server cleans up the user from `userNearbyMap` and iterates over all peers who had that user in their nearby set, emitting `nearby:leave` to those active peers so they can tear down their WebRTC connection, while never attempting to send events to the closed socket.
- Why do you log query timing and what is the target? ProxiSpeak has a hard target of <20ms for proximity queries. The logger measures each query using performance.now(), logs timing data safely without exposing database credentials, and tracks the compliance rate so we can identify bottlenecks before scaling to 50 concurrent users.

## Done checklist
- [x] Week 1 merged to main
- [ ] Week 2 merged, tag v0.2-mid
- [ ] Mid review ready (docs, benchmarks, video)
- [ ] Week 3 merged, tag v0.3
- [ ] Week 4 merged, deployed, tag v1.0
- [ ] Final review ready (report, PPT, video)
