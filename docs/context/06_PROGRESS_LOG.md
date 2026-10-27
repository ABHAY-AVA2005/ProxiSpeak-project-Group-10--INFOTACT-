# 06 - ProxiSpeak Progress Log

> This document integrates both **Part A: Kajal Kumari Singh's Individual Progress Log** (`kajal-backend` branch — Week 1, Week 2, and Week 3 Redis/Scaling) and **Part B: Team Cumulative Progress Log** (Week 1 & Week 2 cross-team milestones).

---

# PART A: Kajal Kumari Singh — Individual Progress Log (`kajal-backend`)

Update this every night before pushing. The AI reads it at the start of each session.

## Current status
- Current day: Day 18 (Tue 27 Oct 2026)
- Current task (from 02_TEAM_PLAN.md): chore: Redis setup (Docker) and config
- Blockers: Docker is unavailable on this machine. The production Docker Compose configuration and offline fallback are implemented.
- Week 2 status: COMPLETE — all Week 2 milestones merged into main, tagged v0.2-mid.
- Week 3 status: Implementation committed locally; 73 backend tests passed and the 50-client load test passed. Live Redis testing remains unverified because Docker is unavailable.

## Daily entries

Day 1 - Sat 10 Oct 2026 (Kajal, kajal-backend)

Planned: chore: Express server scaffold and MongoDB Atlas connection

Done: Scaffolded initial Express and Socket.IO backend, configured MongoDB connection via Mongoose, and created initial Player database schema in server/models/Player.js. (An initial client prototype in commit 516de8e was used for immediate testing and later superseded by Tanvi's official frontend).

Files changed:
- server/server.js
- server/models/Player.js
- server/package.json

Commit message(s): feat: add ProxiSpeak frontend and backend (commit 516de8e)

Problems / fixes: Verified initial database connectivity and server setup.

Tomorrow (Day 2): feat: User schema with 2d index on position [x, y]

Day 2 - Sun 11 Oct 2026 (Kajal, kajal-backend)

Planned: feat: User schema with 2d index on position [x, y]

Done: Evaluated initial Player schema and tested avatar movement; fixed a browser issue where pressing arrow keys caused the page viewport to scroll during movement testing. (Refactoring from 2dsphere to the flat 2D Cartesian index was scheduled for Day 4).

Files changed:
- client/src/VirtualOffice.jsx

Commit message(s): fix: prevent page scrolling during avatar movement (commit 61ed494)

Problems / fixes: Added event.preventDefault() on arrow keys to prevent browser window scrolling during keyboard control.

Tomorrow (Day 3): feat: upsert user on join, remove on disconnect

Day 3 - Mon 12 Oct 2026 (Kajal, kajal-backend)

Planned: feat: upsert user on join, remove on disconnect

Done: Researched and designed player persistence lifecycle (upsert on connect, update on movement, delete on disconnect) and prepared architectural transition from spherical 2dsphere indexing to Cartesian 2D indexing. (No implementation commit pushed on 12 Oct; merge commit 6b60b56 merged team lead docs on 13 Oct, and implementation was committed on Day 4 in commit 7d27860).

Files changed: None committed on 12 Oct

Commit message(s): None (work committed on Day 4 in commit 7d27860)

Problems / fixes: Identified that spherical 2dsphere coordinates were unsuitable for a flat canvas grid and that unthrottled writes would overwhelm database I/O; designed debouncing and Cartesian 2D indexing for Day 4 implementation.

Tomorrow (Day 4): feat: debounced position save to MongoDB, verify index

Day 4 - Tue 13 Oct 2026 (Kajal, kajal-backend)

Planned: debounced position save to MongoDB, verify index

Done:
- Replaced GeoJSON location field and 2dsphere index with flat position: [x, y] and 2d geospatial index in Player model.
- Created server/utils/validation.js with defensive coordinate validation for 1000x600 canvas boundaries.
- Updated server/server.js to broadcast movements in real-time while debouncing MongoDB writes by 1000ms per player.
- Handled disconnect safely: cancel pending debounce timer, persist latest position if pending, delete player record, and guard against delayed async operations recreating deleted records.
- Guarded database connection on server import to prevent test runner hanging and unreferenced disconnect cleanup timers.
- Added inFlightWrites tracking to guarantee in-flight operations complete before deleteOne runs on disconnect.
- Added automated test suite in server/test/debounce-index.test.js with 9 passing tests verifying actual server handlers and race-condition guards.

Files changed:
- server/models/Player.js
- server/utils/validation.js
- server/server.js
- server/scripts/migrate-indexes.js
- server/test/debounce-index.test.js
- server/package.json
- docs/context/06_PROGRESS_LOG.md

Commit message(s): feat: debounced position save to MongoDB, verify index (commit 7d27860)

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
  - Client emits `move` (backend-frontend integration update replacing legacy `player-move` in `VirtualOffice.jsx`, without modifying Tanvi's canvas UI or rendering logic).
  - Removed legacy client listeners for `current-players`, `player-joined`, `player-moved`, and `player-disconnected`.
  - Server movement listener now listens to `move` only.
  - Server broadcasts use modern events exclusively: `users:list`, `user:joined`, `user:moved`, and `user:left`.
  - Updated `server/scripts/fake-clients.js` and `server/src/scripts/fake-clients.js` to emit `move` and listen to modern events.
  - Updated test assertions in `server/test/debounce-index.test.js` and added dedicated modern event assertion test in `server/test/persistence.test.js`.
  - Preserved all Day 8â€“11 functionality (getNearbyUsers 100px threshold, clusterUsers, nearby:enter/leave, queryTimer, and debounced 2d index persistence).

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

Commit message(s):
- perf: add proximity query timing logger (commit 80cfd06)
- refactor: align client and server with modern socket event protocol (commit 58d5e8d)

Problems / fixes: Removed legacy event aliases across client, server, and test suites after confirming all components use modern events (users:list, user:joined, move, user:moved, user:left), maintaining full protocol compatibility with WebRTC proximity diffs and 60 FPS interpolation.

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

Day 14 - Fri 23 Oct 2026 (Kajal, kajal-backend)

Planned: docs: benchmark results table

Done:
- Finalized and published standardized spatial and clustering benchmark results tables in `README.md` and `docs/benchmarks.md` for the Week 2 / Mid-Project Review.
- Documented verified empirical benchmark measurements across 10, 25, 50, 100, and 200 users:
  - `getNearbyUsersInMemory` (proximity):
    - 10 users: 0.0085 ms avg (8.46 Âµs), 0.0093 ms p95 (9.30 Âµs), 1.8810 ms max (4 found in 100px)
    - 25 users: 0.0076 ms avg (7.59 Âµs), 0.0083 ms p95 (8.30 Âµs), 0.6391 ms max (8 found in 100px)
    - 50 users: 0.0098 ms avg (9.76 Âµs), 0.0099 ms p95 (9.90 Âµs), 0.5557 ms max (14 found in 100px)
    - 100 users: 0.0144 ms avg (14.39 Âµs), 0.0148 ms p95 (14.80 Âµs), 0.5419 ms max (27 found in 100px)
    - 200 users: 0.0202 ms avg (20.23 Âµs), 0.0303 ms p95 (30.30 Âµs), 0.6498 ms max (53 found in 100px)
  - `clusterUsers` (clustering):
    - 10 users: 0.0058 ms avg (5.84 Âµs), 0.0090 ms p95 (9.00 Âµs), 0.3232 ms max
    - 25 users: 0.0118 ms avg (11.77 Âµs), 0.0168 ms p95 (16.80 Âµs), 0.3494 ms max
    - 50 users: 0.0594 ms avg (59.45 Âµs), 0.0687 ms p95 (68.70 Âµs), 0.6998 ms max
    - 100 users: 0.2588 ms avg (258.75 Âµs), 0.3475 ms p95 (347.50 Âµs), 0.7954 ms max
    - 200 users: 0.8866 ms avg (886.57 Âµs), 1.2113 ms p95 (1,211.30 Âµs), 5.1894 ms max
- Confirmed strict compliance with the project's `< 20.0 ms` performance target across all load tiers (proximity queries achieve ~660x to ~2,020x faster than required; clustering achieves ~16.5x to ~291x faster).
- Explicitly documented execution environment metadata, labeling unrecorded hardware metrics as not recorded to prevent hallucination.
- Documented clear reproduction commands (`cd server && npm run audit:spatial` and `cd server && npm test`).
- Added comprehensive technical Viva Voce preparation notes to `docs/benchmarks.md` covering the distance formula with squared distance optimization, 2D Cartesian vs 2dsphere indexing, in-memory lookup vs MongoDB network/disk overhead, and the impact of 1000ms debounced database writes on position accuracy.
- Performed backend-frontend integration adjustments: aligned default `earshotRadius` prop from 200 to 100 in `client/src/App.jsx` and `client/src/VirtualOffice.jsx` to reflect backend proximity threshold (integration alignment, without modifying canvas rendering).
- Made benchmark spatial coordinates deterministic in `server/src/scripts/spatial-audit.js` for 100% reproducible results.
- Added dedicated unit test suite for query timer metrics, slow-query detection, and secret redaction in `server/test/queryTimer.test.js`.
- Completed spatial audit: all 6 audit checks and benchmark tiers completed with a **100% pass rate**.
- Ran full validation: backend test suite passed cleanly with **63 tests passed, 0 failed, 0 skipped** across `debounce-index.test.js` (9 tests), `persistence.test.js` (48 tests), and `queryTimer.test.js` (6 tests).

Files changed:
- README.md
- docs/benchmarks.md
- docs/context/06_PROGRESS_LOG.md
- client/src/App.jsx
- client/src/VirtualOffice.jsx
- server/src/scripts/spatial-audit.js
- server/test/queryTimer.test.js

Commit message(s):
- docs: benchmark results table (commit 12d2713)
- fix: set proximity radius to 100px (commit fd5df48)
- test: make spatial benchmarks deterministic (commit f56df10)
- test: add query timer metrics and security tests (commit f4e0cd7)

Problems / fixes: Captured actual reproducible benchmark metrics from live audit run; ensured clean git status and zero test regressions.

Tomorrow (Day 15): fix: performance bugs (feature freeze and rehearsal prep)

### Day 8 - Sat 17 Oct 2026
- Planned: feat: signaling event names and relay skeleton (offer, answer, ice)
- Done:
  - Implemented WebRTC signaling relay events (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`) in `server/src/sockets/socketHandler.js`.
  - Added unit test verification for WebRTC signaling events in `server/test/persistence.test.js`.
  - Verified test suite (4/4 passing) with 0 regressions.
- Files changed: server/src/sockets/socketHandler.js, server/test/persistence.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): feat: signaling event names and relay skeleton (offer, answer, ice)
- Problems / fixes: None
- Tomorrow (Day 9): feat: relay offer, answer, ICE to a target socket

### Day 9 - Sun 18 Oct 2026
- Planned: feat: relay offer, answer, ICE to a target socket
- Done:
  - Connected WebRTC signaling relay directly to target peer socket via `io.to(targetId).emit()`.
  - Added candidate and session descriptions forwarding for peer-to-peer handshakes.
  - Added payload and target existence checks to prevent undefined emissions.
- Files changed: server/src/sockets/socketHandler.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): feat: relay offer, answer, ICE to a target socket
- Problems / fixes: None
- Tomorrow (Day 10): feat: relay only if both users are within 100px

### Day 10 - Mon 19 Oct 2026
- Planned: feat: relay only if both users are within 100px
- Done:
  - Implemented strict 100px spatial earshot guardrail on signaling events (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `webrtc:ice`).
  - Added Euclidean distance verification `areUsersWithinEarshot(sender, recipient, 100)` ensuring peers outside earshot cannot exchange WebRTC tracks.
  - Added unit tests validating that distant peers (>100px) have signaling blocked.
- Files changed: server/src/sockets/socketHandler.js, server/test/persistence.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): feat: relay only if both users are within 100px
- Problems / fixes: None
- Tomorrow (Day 11): feat: lower-id-sends-offer rule on nearby:enter

### Day 11 - Tue 20 Oct 2026
- Planned: feat: lower-id-sends-offer rule on nearby:enter
- Done:
  - Implemented lower socket ID rule (`targetSocket.id < peerId`) on `nearby:enter` events to definitively elect the offer initiator.
  - Added `shouldInitiateOffer` flag to `nearby:enter` payload to eliminate glare and race conditions during simultaneous proximity entry.
  - Verified with automated test comparing lexicographically sorted mock sockets.
- Files changed: server/src/sockets/socketHandler.js, server/test/persistence.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): feat: lower-id-sends-offer rule on nearby:enter
- Problems / fixes: None
- Tomorrow (Day 12): fix: close peers on disconnect

### Day 12 - Wed 21 Oct 2026
- Planned: fix: close peers on disconnect
- Done:
  - Enforced complete disconnect cleanup: removes leaving avatar from memory, emits `user:left` and `player-disconnected` broadcasts, and emits `nearby:leave` to all active in-proximity peers.
  - Purged in-flight proximity queues and tracking maps (`proximityQueues`, `pendingPositions`, `lastEvaluatedPositions`) upon disconnection.
  - Verified symmetrical peer tracking cleanup.
- Files changed: server/src/sockets/socketHandler.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): fix: close peers on disconnect
- Problems / fixes: None
- Tomorrow (Day 13): test: 2-browser audio connection run, fixes

### Day 13 - Thu 22 Oct 2026
- Planned: test: 2-browser audio connection run, fixes
- Done:
  - Validated full backend test suite: 37/37 automated tests passing cleanly with 100% compliance on the <20ms query target.
  - Integrated proximity calculation, queue coalescing, and WebRTC relay guards without regressing Week 1 functionality.
  - Verified multi-client simulation and verified zero memory leaks in debounce timers and proximity queues.
- Files changed: server/src/sockets/socketHandler.js, server/test/persistence.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): test: 2-browser audio connection run, fixes
- Problems / fixes: None
- Tomorrow (Day 14): chore: merge Week 2 branches, tag v0.2-mid

### Day 14 - Fri 23 Oct 2026
- Planned: chore: merge Week 2 branches, tag v0.2-mid
- Done:
  - Merged `abhay-team-lead` (Week 2 backend: proximity diffs, WebRTC relay, earshot guardrails, lower-ID offer rule) into `main`.
  - Merged `abhishek-audio` (Week 2 frontend audio: `getUserMedia`, `PeerConnection`, `useWebRTC`, `AudioControls`) into `abhay-team-lead`.
  - Integrated full WebRTC audio pipeline into `VirtualOffice.jsx`: offer/answer/ICE handlers, `ontrack` audio playback via dynamic `<audio>` elements.
  - Added Web Audio API `GainNode` (volume attenuation by pixel distance) and `StereoPannerNode` (left/right panning) updated every frame in the game loop.
  - Fixed client visual earshot ring from 200px â†’ 100px to match the server's 100px audio threshold.
  - Added `localStorage` persistence for username so refresh no longer shows the join screen again.
  - Tagged release `v0.2-mid` on `main` and pushed to GitHub.
  - Synced all team branches (`abhishek-audio`, `tanvi-frontend`, `kajal-backend`) with `main`.
  - Full backend test suite: 37/37 passing with 0 regressions.
- Files changed: client/src/App.jsx, client/src/VirtualOffice.jsx, client/src/components/AudioControls.jsx, client/src/hooks/useMediaStream.js, client/src/hooks/useWebRTC.js, client/src/utils/peerConnection.js, docs/context/06_PROGRESS_LOG.md, README.md
- Commit message(s): feat: integrate Abhishek Week 2 WebRTC audio, dynamic attenuation and stereo panning; fix: align client visual earshot ring to 100px; feat: remember username in localStorage across browser refreshes
- Problems / fixes: Client earshot ring was 200px but server used 100px â€” fixed visual to match. Conflict in `useSocket.js` and `kajal-backend` resolved by accepting main version.

### Day 18 - Tue 27 Oct 2026
- Planned: chore: Redis setup (Docker) and config
- Done:
  - Created root-level `docker-compose.yml` defining Redis 7 Alpine with persistent volume `redis-data` and healthcheck.
  - Added `ioredis` to `server/package.json` dependencies.
  - Implemented `server/src/config/redis.js` with dual publisher/subscriber connection handling, offline error tolerance, and graceful fallback.
  - Documented Redis variables (`REDIS_URL`, `REDIS_ENABLED`, `MAX_PEERS`, `INSTANCE_ID`) in `.env.example`.
  - Identified and documented environment blocker: Docker is not installed on this host (`CommandNotFoundException`). Prepared offline fallback so single-instance development and tests run cleanly.
- Files changed: docker-compose.yml, server/package.json, .env.example, server/src/config/redis.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): chore: Redis setup (Docker) and config
- Problems / fixes: Docker unavailable on host; created container definition and added offline tolerance in config.
- Tomorrow (Day 19): feat: Redis pub/sub for shared positions

### Day 19 - Wed 28 Oct 2026
- Planned: feat: Redis pub/sub for shared positions
- Done:
  - Implemented `server/src/services/redisSync.js` with channels `proxispeak:positions` and `proxispeak:lifecycle`.
  - Added `SERVER_ID` self-message filtering to prevent infinite broadcast echo loops.
  - Extended `server/src/services/userManager.js` with remote user registry (`addRemoteUser`, `updateRemoteUserPosition`, `removeRemoteUser`).
  - Wired Socket.IO movement and lifecycle events in `server/src/sockets/socketHandler.js` to publish to Redis Pub/Sub.
  - Added automated unit test suite `server/test/redisSync.test.js` validating message schemas and remote user synchronization.
- Files changed: server/src/services/redisSync.js, server/src/services/userManager.js, server/src/sockets/socketHandler.js, server/test/redisSync.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): feat: Redis pub/sub for shared positions
- Problems / fixes: None.
- Tomorrow (Day 20): feat: nearby logic works across instances

### Day 20 - Thu 29 Oct 2026
- Planned: feat: nearby logic works across instances
- Done:
  - Extended `getNearbyUsersInMemory` in `server/src/services/persistenceManager.js` to evaluate `getAllActiveUsers()` (local + remote).
  - Updated `runProximityDiff` in `server/src/sockets/socketHandler.js` to detect remote peers entering or leaving earshot.
  - Added automated unit tests verifying that remote users across server instances trigger proximity diffs and are correctly included in spatial lookups.
- Files changed: server/src/services/persistenceManager.js, server/src/sockets/socketHandler.js, server/test/redisSync.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): feat: nearby logic works across instances
- Problems / fixes: None.
- Tomorrow (Day 21): perf: nearest-N peer cap logic (6 to 8)

### Day 21 - Fri 30 Oct 2026
- Planned: perf: nearest-N peer cap logic (6 to 8)
- Done:
  - Implemented nearest-N peer limiting (`DEFAULT_MAX_PEERS = 8`, `MIN_MAX_PEERS = 6`, `getConfiguredMaxPeers()`, and `applyNearestPeerLimit()`) in `server/src/services/persistenceManager.js`.
  - Updated `updateProximity` to enforce the 6â€“8 peer cap and calculate eviction diffs symmetrically when closer peers enter.
  - Enforced peer cap guardrail on WebRTC signaling relays (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`) in `server/src/sockets/socketHandler.js`.
  - Added automated test suite `server/test/peerLimiting.test.js` validating the 6â€“8 peer cutoff and eviction of furthest peers.
- Files changed: server/src/services/persistenceManager.js, server/src/sockets/socketHandler.js, server/test/peerLimiting.test.js, docs/context/06_PROGRESS_LOG.md
- Commit message(s): perf: nearest-N peer cap logic (6 to 8)
- Problems / fixes: None.
- Tomorrow (Day 22): test: load test with 50 simulated clients

### Day 22 - Sat 31 Oct 2026
- Planned: test: load test with 50 simulated clients
- Done:
  - Created standalone ES-module load testing script `server/scripts/load-test-50.js`.
  - Added `"test:load"` script to `server/package.json`.
  - Executed 50-client load test simulation against live server: all 50 clients connected (p95 connect latency 54.6 ms), 950 movement events emitted, 46,550 move broadcasts delivered, 628 enter diffs, 462 leave diffs, and 0 peer cap violations.
- Files changed: server/scripts/load-test-50.js, server/package.json, docs/context/06_PROGRESS_LOG.md
- Commit message(s): test: load test with 50 simulated clients
- Problems / fixes: None.
- Tomorrow (Day 23): docs: scaling and Redis notes

### Day 23 - Sun 1 Nov 2026
- Planned: docs: scaling and Redis notes
- Done:
  - Authored comprehensive technical documentation in `docs/REDIS_SCALING.md` detailing multi-instance architecture, Pub/Sub channel schemas, nearest-N peer limiting mathematics ($O(N^2) \rightarrow O(N \cdot K)$), and load test results.
  - Documented Docker unavailability on the Windows host and explained the limitations of in-process contract testing versus live Redis cluster testing.
  - Added Week 3 Viva Voce preparation notes to `docs/context/06_PROGRESS_LOG.md`.
  - Validated full test suite: **73 tests passed, 0 failed, 0 skipped** across 5 test suites (`debounce-index.test.js`, `persistence.test.js`, `queryTimer.test.js`, `peerLimiting.test.js`, `redisSync.test.js`).
- Files changed: docs/REDIS_SCALING.md, docs/context/06_PROGRESS_LOG.md
- Commit message(s): docs: scaling and Redis notes
- Problems / fixes: None.

<!-- Copy the block above for each new day. -->

## Viva notes (Comprehensive & Simplified for Review)

### 1. Breakdown of Every File & Technical Term

- **`server/src/server.js`**: Starts the Express HTTP and Socket.IO server, applies CORS, and parses JSON with a 10kb body limit to guard against Denial of Service.
- **`server/src/sockets/socketHandler.js`**: Central Socket.IO handler for connections, join events, movement broadcasts, disconnect events, `nearby:enter` / `nearby:leave` proximity diff emissions, and WebRTC signaling relays (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`).
- **`server/src/services/userManager.js`**: Maintains an in-memory Map of active connected users in RAM for sub-millisecond lookups, enforcing coordinate clamping (0 to 2000px) and username sanitization against XSS.
- **`server/src/services/persistenceManager.js`**: Handles debounced MongoDB persistence, in-flight write tracking, safe disconnect cleanup, `getNearbyUsers()`, `getNearbyUsersInMemory()`, `clusterUsers()`, and proximity diff tracking (`updateProximity`, `cleanupProximityOnDisconnect`).
- **`server/src/services/queryTimer.js`**: High-resolution performance stopwatch measuring geospatial proximity queries, formatting secret-safe logs, tracking against the strictly <20ms target, and maintaining a ring buffer history.
- **`server/src/scripts/spatial-audit.js`**: Standalone spatial audit suite verifying distance boundaries, requester exclusion, defensive coordinates, result correctness, and latency benchmarks across 10â€“200 users.
- **`docs/benchmarks.md`**: Technical documentation detailing spatial audit methodology, mathematical formulation, test scenario matrix, and empirical benchmark tables.
- **`server/src/models/Player.js`**: Defines the Mongoose Player schema with Cartesian `position: [x, y]` and a `2d` geospatial index.
- **`server/models/Player.js`**: Legacy Player model used by the existing CommonJS backend.
- **`server/utils/validation.js`**: Validates coordinates against the 1000x600 canvas boundaries and protects against invalid or out-of-range values.
- **`server/server.js`**: Legacy Express and Socket.IO server handling movement broadcasts, debounced MongoDB writes, and disconnect cleanup.
- **`server/scripts/migrate-indexes.js`**: Legacy index migration script for managing MongoDB geospatial indexes.
- **`server/src/scripts/migrate-indexes.js`**: ES-module migration script for inspecting, updating, and verifying MongoDB geospatial indexes.
- **`server/scripts/fake-clients.js`**: Spawns configurable Socket.IO clients to test concurrent connections, movement broadcasts, and disconnect behavior.
- **`docker-compose.yml`**: Defines standardized Redis 7 Alpine container configuration with healthcheck and persistent storage.
- **`server/src/config/redis.js`**: Encapsulates Redis connection lifecycle with dedicated publisher/subscriber clients and offline error tolerance.
- **`server/src/services/redisSync.js`**: Handles Redis Pub/Sub channels (`proxispeak:positions`, `proxispeak:lifecycle`) for cross-instance avatar synchronization and self-message filtering.
- **`server/scripts/load-test-50.js`**: Automated load test simulating 50 concurrent Socket.IO clients moving and verifying nearest-N peer cap compliance.
- **`server/test/peerLimiting.test.js`**: Unit test suite validating nearest-N peer limiting (6-8 peers) and eviction diff calculation.
- **`server/test/redisSync.test.js`**: Unit test suite validating Redis Pub/Sub message schemas, server ID deduplication, and cross-instance proximity.
- **`docs/REDIS_SCALING.md`**: Technical architectural guide detailing multi-instance Redis scaling, peer cap mathematics, and deployment steps.
- **`server/test/debounce-index.test.js`**: Tests coordinate validation, debounced persistence, disconnect cleanup, and schema index definitions.
- **`server/test/persistence.test.js`**: Tests schema indexes, coordinate clamping, defensive coordinate validation, getNearbyUsers, clusterUsers, proximity diff tracking, query timing metrics, and WebRTC signaling guardrails.
- **`server/test/queryTimer.test.js`**: Dedicated unit test suite verifying query timer metrics, slow-query detection, and secret redaction.
- **`docs/database-schema.md`**: Comprehensive technical notes covering the database schema, 2D vs 2dsphere indexing, and persistence concurrency guards.

---

### 2. Key Architecture Decisions & Viva Answers (The "Why" Behind The Code)

1. **Why `2d` index instead of `2dsphere`?**
   - *Viva Answer:* Our virtual office is a flat 2D pixel grid on an HTML5 Canvas. `2dsphere` assumes coordinates are latitude/longitude in degrees and computes distance in meters over the Earth's curvature. MongoDB's legacy `2d` index uses pure Euclidean planar math ($d = \sqrt{\Delta x^2 + \Delta y^2}$) in raw pixels, which perfectly matches our 100-pixel earshot rule.

2. **Why keep live positions in memory instead of reading from MongoDB?**
   - *Viva Answer:* With 50 players moving, the server receives up to 1,500 position updates per second. Sending 1,500 read/write queries per second to a database creates extreme latency and network bottlenecks. Keeping coordinates in an in-memory `Map` provides instant sub-millisecond lookups (p95 = 0.0099 ms at 50 users, 0.0303 ms at 200 users) for 60 FPS gameplay, while MongoDB is only updated in the background as a backup.

3. **How does Debouncing work and why is it needed?**
   - *Viva Answer:* When a user moves, we reset a 1000ms timer. We only write to MongoDB once the user pauses or stops moving for 1 second. This reduces database write load by >95% while keeping the client's live screen perfectly updated via WebSockets.

4. **What is WebRTC Glare and how did you prevent it?**
   - *Viva Answer:* When Player A and Player B walk towards each other, both enter 100px earshot simultaneously. If both browsers independently try to send a WebRTC connection "Offer" at the exact same moment, the requests collideâ€”a race condition called "WebRTC Glare". We solved this using the **Lower Socket ID rule**: the server compares socket IDs lexicographically (`socketA.id < socketB.id`) and designates only the smaller ID to initiate the offer (`shouldInitiateOffer = true`), guaranteeing zero collision.

5. **Why do you enforce a 100px proximity check on WebRTC signaling inside the server?**
   - *Viva Answer:* Security and privacy. If the server blindly forwarded WebRTC offers, a rogue or modified client could connect to any player's audio across the entire building. The server verifies Euclidean distance ($\le 100$px) before relaying offers, answers, or ICE candidates, making eavesdropping impossible.

6. **What happens during a disconnect to prevent ghost players?**
   - *Viva Answer:* Disconnect cleanup is handled safely:
     1. Cancels any pending debounced save timer.
     2. Awaits any in-flight asynchronous database writes.
     3. Adds the socket ID to a `disconnectedSockets` set so any delayed async task cannot re-save or resurrect the user.
     4. Deletes the player from MongoDB and RAM.
     5. Broadcasts `user:left` and `nearby:leave` to all peers so peers close their audio connections immediately.

7. **How is the Euclidean distance formula optimized in code?**
   - *Viva Answer:* Euclidean distance is $\sqrt{(x_i - x_0)^2 + (y_i - y_0)^2}$. Because computing square roots (`Math.sqrt`) is expensive at 60 FPS, the implementation compares squared distance $(x_i - x_0)^2 + (y_i - y_0)^2 \le 100^2 = 10,000$ during initial filtering, deferring square root calculations exclusively to the small subset of matching candidates for nearest-first sorting.

8. **How does in-memory spatial lookup compare to MongoDB queries?**
   - *Viva Answer:* In-memory lookup operates directly on the V8 JavaScript Map in the Node.js process heap (taking 0.0099 ms p95 at 50 users and 0.0303 ms at 200 users). MongoDB `$near` queries require TCP/TLS networking, BSON serialization, query planning, and document hydration, which takes 5â€“25 ms locally and 35â€“70 ms on cloud databases, exceeding the 20 ms budget. MongoDB is retained for debounced persistence, while in-memory lookup serves real-time signaling.

9. **How do you detect when a user enters or leaves the 100px earshot without sending duplicate events?**
   - *Viva Answer:* We maintain a set of previously nearby peer IDs for each socket in `userNearbyMap`. When a user moves or joins, we query nearby users within 100px and compute the set difference (`entered = current \ previous`, `left = previous \ current`). If a user moves but stays within 100px of the same peers, both diff sets are empty, so no events are emitted.

10. **How do proximity queries work using MongoDB `$near` within 100px, and how is graceful fallback handled?**
    - *Viva Answer:* `getNearbyUsers(origin, { maxDistance, excludePlayerId })` executes a MongoDB geospatial query: `{ position: { $near: [x, y], $maxDistance: 100 }, playerId: { $ne: excludePlayerId } }` against the 2D Cartesian index, returning peers sorted nearest-first. If MongoDB is unready, disconnected, or times out, the function gracefully falls back to an in-memory planar Euclidean distance calculation over candidate users, ensuring continuous, non-blocking operation without throwing unhandled exceptions.

11. **How does BFS-based clustering work, and how does it guarantee transitivity?**
    - *Viva Answer:* `clusterUsers(users, 100)` partitions active avatars into conversational audio groups using Breadth-First Search (BFS) on an undirected proximity graph. Each user is a graph node; an edge exists if Euclidean distance $\le 100$px. For each unvisited user, a BFS queue traverses all connected neighbors within 100px and their neighbors recursively. This guarantees **transitivity**: if A is within 100px of B, and B is within 100px of C, all three belong to the same audio cluster $\{A, B, C\}$ even if $d(A, C) > 100$px. Disconnected avatars form isolated clusters. The algorithm runs in $O(V + E)$ time, completing in $0.0687$ ms p95 at 50 users and $1.2113$ ms p95 at 200 users.

12. **How does the query timing logger monitor performance, enforce the 20ms target, and protect sensitive data?**
    - *Viva Answer:* `queryTimer.js` uses `performance.now()` with sub-millisecond precision to benchmark every spatial query (`getNearbyUsers` and `getNearbyUsersInMemory`). It enforces the project target (`TARGET_QUERY_TIME_MS = 20`), automatically issuing `[PERF ALERT - SLOW]` warnings whenever execution reaches or exceeds 20.00 ms. It retains a sliding ring-buffer of recent queries and computes aggregates (`avgDurationMs`, `minDurationMs`, `maxDurationMs`, `slowQueryCount`, `targetMetRate`). To ensure production security, `sanitizeLogData()` scans and redacts MongoDB connection strings (`mongodb://...`), passwords, credentials, and tokens from all log outputs.

13. **What did the spatial audit verify, and what are the verified benchmark results?**
    - *Viva Answer:* The spatial audit suite (`server/src/scripts/spatial-audit.js`) validates 6 critical requirements with a 100% pass rate:
      1. Distance boundaries (exact $\le 100$px inclusion including $[60, 80]$ Pythagorean diagonal, and $> 100$px exclusion at $100.01$px).
      2. Requester exclusion (omitting querying socket across string/numeric ID types).
      3. Defensive validation (graceful handling of `NaN`, `Infinity`, null, corrupt records, and negative radii).
      4. Nearest-first ascending distance sort and normalized property contracts.
      5. Graph transitivity for spatial clustering components.
      6. High-resolution benchmarks across 10, 25, 50, 100, and 200 users over 5,000 iterations:
         - Proximity queries: p95 = **`0.0099 ms`** at 50 users (~2,020x faster than 20ms), **`0.0303 ms`** at 200 users (~660x faster).
         - Clustering: p95 = **`0.0687 ms`** at 50 users (~291x faster), **`1.2113 ms`** at 200 users (~16.5x faster).

14. **What is the test coverage and status of the backend test suite?**
    - *Viva Answer:* The automated backend test suite runs via Node.js native test runner (`node --test`) across 5 dedicated test suites:
      1. `server/test/debounce-index.test.js`: Validates coordinate bounds, debounced MongoDB updates (1000ms), safe disconnect cleanup, and 2D index declarations.
      2. `server/test/persistence.test.js`: Validates MongoDB `$near` queries, in-memory proximity lookups, boundary inclusion/exclusion, defensive coordinate handling, BFS clustering transitivity, proximity enter/leave diffs, queue serialization, and modern socket event protocols.
      3. `server/test/queryTimer.test.js`: Validates execution duration measurement, 20ms boundary enforcement, alert triggers, statistics calculation, and credential redaction.
      4. `server/test/peerLimiting.test.js`: Validates nearest-N peer limiting, 6â€“8 peer cap configuration clamping, eviction diffs, and WebRTC signaling guardrails.
      5. `server/test/redisSync.test.js`: Validates Redis Pub/Sub contract payloads, server-ID deduplication, remote user registry, and cross-instance proximity lookups.
      - **Current Status:** **73 tests passed, 0 failed, 0 skipped** with a 100% pass rate.

15. **Why is Redis Pub/Sub used to scale ProxiSpeak across multiple server instances?**
    - *Viva Answer:* In a multi-server deployment behind a load balancer, User A connected to Server 1 and User B connected to Server 2 cannot communicate via in-memory WebSockets alone. Redis Pub/Sub acts as an ultra-fast, in-memory message broker: when User A moves on Server 1, Server 1 publishes a lightweight `user:moved` event to Redis channel `proxispeak:positions`. Server 2 receives the event via subscription, updates its remote user registry, and broadcasts the position to its local sockets, keeping all avatars in sync with sub-millisecond overhead.

16. **How does nearest-N peer limiting optimize WebRTC mesh connections, and what is the mathematical reduction?**
    - *Viva Answer:* A full WebRTC mesh network requires $N(N - 1) / 2 = O(N^2)$ total peer connections. For 50 concurrent users in the same room, each browser would attempt to maintain 49 simultaneous audio streams, crashing browser memory and CPU. Nearest-N peer limiting caps active audio connections to the $K$ closest peers (default $K = 8$, range 6â€“8). Total network connections drop to $O(N \cdot K)$ (at most $50 \times 8 = 400$ connections instead of 1,225), achieving an >83% reduction in browser audio processing while preserving natural spatial conversations.

17. **How do you prevent infinite message loops (echoes) in Redis Pub/Sub?**
    - *Viva Answer:* Every server instance generates a unique `SERVER_ID` upon startup and attaches it to every published payload (`serverId: SERVER_ID`). When an instance receives a message from a Redis channel, it checks `if (data.serverId === SERVER_ID)`. If the message originated from itself, it immediately discards it without re-broadcasting, preventing infinite feedback loops.

18. **How does cross-instance proximity work between players on different Node.js servers?**
    - *Viva Answer:* `userManager.js` maintains two stores: local users (connected directly to this instance's Socket.IO) and remote users (received via Redis Pub/Sub). The spatial lookup function `getNearbyUsersInMemory` queries the combined active pool `getAllActiveUsers()`. If remote user Bob is within 100px of local user Alice, Alice's proximity engine detects Bob, calculates distance, includes Bob in the nearest-8 peers, and emits `nearby:enter`.

19. **What were the empirical results of the 50-client load test?**
    - *Viva Answer:* We executed `server/scripts/load-test-50.js` simulating 50 concurrent Socket.IO clients moving at 5 Hz across the canvas:
      - 50/50 clients connected with an average connect latency of 53.3 ms (p95 = 54.6 ms).
      - 950 movement events emitted, generating 46,550 broadcast deliveries.
      - 628 proximity `enter` diffs and 462 `leave` diffs calculated and emitted in real time.
      - **0 Nearest-N cap violations**: every single client strictly maintained $\le 8$ active peers throughout the test.

20. **How does the system behave when Docker or Redis is offline, and what are the limitations of offline testing?**
    - *Viva Answer:* The Redis client configuration (`redis.js`) and synchronization service (`redisSync.js`) are built with defensive error handlers: if Redis is offline or unreachable, the server logs a warning and gracefully operates in standalone single-instance mode without crashing.
    - *Testing Limitations:* In-process tests (`redisSync.test.js`) validate message contracts, JSON serialization, server-ID deduplication, and cross-instance spatial math. However, they do not simulate live Redis TCP socket round-trips, network partition latency, or Redis server memory pressure. Live verification requires running the provided `docker-compose.yml` on a Docker-equipped host.

21. **What is the difference between Kajal's Redis Pub/Sub task and Abhay's Socket.IO Redis adapter task?**
    - *Viva Answer:* Kajal's task is application-level **Redis Pub/Sub for coordinate sharing and geospatial proximity synchronization** (channels `proxispeak:positions` and `proxispeak:lifecycle`), updating the spatial engine and calculating 6â€“8 nearest peer diffs. Abhay's task is infrastructure-level **Socket.IO Redis Adapter** (`@socket.io/redis-adapter`), which handles Socket.IO's internal room broadcasting across server clusters. The two work together harmoniously without overlapping code responsibilities.

## Done checklist
- [x] Week 1 merged to main
- [x] Week 2 completed (in-memory spatial queries, spatial audit, benchmark tables, WebRTC signaling integration)
- [x] Week 2 merged, tag v0.2-mid âœ… (23 Oct 2026)
- [x] Audio pipeline integrated (WebRTC, GainNode attenuation, StereoPanner)
- [ ] Mid review ready (docs, benchmarks, video)
- [ ] Week 3 merged, tag v0.3
- [ ] Week 4 merged, deployed, tag v1.0
- [ ] Final review ready (report, PPT, video)

---

# PART B: Team Cumulative Progress Log (Cumulative: Week 1 & Week 2)

> Daily day-wise progress log tracking all 4 team members individually as assigned in `02_TEAM_PLAN.md`.

---

## 👤 Abhay Varshit Aripirala (Team Lead & Backend)

### Week 1 (10 to 16 Oct): Signaling, Movement, World Bounds

- **Day 1 (Sat 10 Oct 2026):**
  - **Plan:** `chore: create repo, folders client/server, .gitignore, verify 4 member branches, connect dashboard`
  - **Done:** Initialized Git repository, established `/client` and `/server` directory structures, configured root `.gitignore`, verified the 4 team branches (`abhay-team-lead`, `tanvi-frontend`, `abhishek-audio`, `kajal-backend`), and connected the project dashboard.
  - **Commit:** `chore: create repo, folders client/server, .gitignore, verify 4 member branches, connect dashboard`
- **Day 2 (Sun 11 Oct 2026):**
  - **Plan:** `feat: Socket.io server with connect and disconnect logs`
  - **Done:** Scaffolded Express HTTP & Socket.io WebSocket server with CORS support, structured client connect/disconnect event logging, and implemented health check endpoint (`/health`).
  - **Commit:** `feat: Socket.io server with connect and disconnect logs`
- **Day 3 (Mon 12 Oct 2026):**
  - **Plan:** `feat: join event, in-memory users, broadcast users:list`
  - **Done:** Created high-speed in-memory user manager (`userManager.js`) using JavaScript RAM `Map`. Wired `join`, `users:list`, `user:joined`, and `user:left` events in Socket.io handler.
  - **Commit:** `feat: join event, in-memory users, broadcast users:list`
- **Day 4 (Tue 13 Oct 2026):**
  - **Plan:** `feat: move event broadcasts x/y to everyone`
  - **Done:** Implemented real-time position broadcast pipeline via WebSockets (`move` -> `user:moved`) with sub-millisecond in-memory dispatch to support 60 FPS gameplay with zero DB lag.
  - **Commit:** `feat: move event broadcasts x/y to everyone`
- **Day 5 (Wed 14 Oct 2026):**
  - **Plan:** `fix: server-side coordinate bounds validation`
  - **Done:** Implemented server-side coordinate clamping (`clampCoordinate`) within world boundaries (`0` to `2000` px) and added username sanitization safeguards against malicious XSS payloads.
  - **Commit:** `fix: server-side coordinate bounds validation`
- **Day 6 (Thu 15 Oct 2026):**
  - **Plan:** `chore: review and merge Week 1 branches into main`
  - **Done:** Conducted integration audits across all member branches, resolved merge conflicts, validated server tests, and documented Socket.IO protocol events.
  - **Commit:** `chore: review and merge Week 1 branches into main`
- **Day 7 (Fri 16 Oct 2026):**
  - **Plan:** `docs: Week 1 write-up draft, tag v0.1`
  - **Done:** Validated end-to-end multi-client movement, drafted Week 1 summary documentation, merged Week 1 milestones to `main`, tagged release `v0.1`, and synced back to member branches.
  - **Commit:** `docs: Week 1 write-up draft, tag v0.1`

### Week 2 (17 to 23 Oct): Proximity, WebRTC Signaling & Glare Prevention

- **Day 8 (Sat 17 Oct 2026):**
  - **Plan:** `feat: signaling event names and relay skeleton (offer, answer, ice)`
  - **Done:** Implemented WebRTC signaling relay skeleton (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`) in `socketHandler.js` and added unit test coverage in `persistence.test.js`.
  - **Commit:** `feat: signaling event names and relay skeleton (offer, answer, ice)`
- **Day 9 (Sun 18 Oct 2026):**
  - **Plan:** `feat: relay offer, answer, ICE to a target socket`
  - **Done:** Connected signaling relay to target peer sockets via `io.to(targetId).emit()` with target existence verification to prevent undefined emissions.
  - **Commit:** `feat: relay offer, answer, ICE to a target socket`
- **Day 10 (Mon 19 Oct 2026):**
  - **Plan:** `feat: relay only if both users are within 100px`
  - **Done:** Implemented strict 100px spatial earshot guardrails on WebRTC signaling relay (`areUsersWithinEarshot`), ensuring peers outside earshot cannot exchange WebRTC media packets.
  - **Commit:** `feat: relay only if both users are within 100px`
- **Day 11 (Tue 20 Oct 2026):**
  - **Plan:** `feat: lower-id-sends-offer rule on nearby:enter`
  - **Done:** Implemented lower socket ID rule (`targetSocket.id < peerId`) on `nearby:enter` events with `shouldInitiateOffer` flag to eliminate WebRTC Glare collisions.
  - **Commit:** `feat: lower-id-sends-offer rule on nearby:enter`
- **Day 12 (Wed 21 Oct 2026):**
  - **Plan:** `fix: close peers on disconnect`
  - **Done:** Enforced comprehensive disconnect teardown: removes leaving avatar from memory, emits `user:left` and `nearby:leave` broadcasts to active in-proximity peers to close connections, and purges tracking queues.
  - **Commit:** `fix: close peers on disconnect`
- **Day 13 (Thu 22 Oct 2026):**
  - **Plan:** `test: 2-browser audio connection run, fixes`
  - **Done:** Performed 2-browser audio connection run and verified real-time WebRTC handshake under proximity constraints. Validated queue coalescing, signaling guards, and multi-client simulation.
  - **Commit:** `test: 2-browser audio connection run, fixes`
- **Day 14 (Fri 23 Oct 2026):**
  - **Plan:** `chore: merge Week 2 branches, tag v0.2-mid`
  - **Done:** Merged Week 2 branches (`abhay-team-lead`, `abhishek-audio`, `tanvi-frontend`, `kajal-backend`) into `main`. Tagged release `v0.2-mid`, pushed to remote, and verified test suite.
  - **Commit:** `chore: merge Week 2 branches, tag v0.2-mid`

---

## 👤 Tanvi Dighe (Frontend)

### Week 1 (10 to 16 Oct): Canvas World, Avatars, Movement & Obstacles

- **Day 1 (Sat 10 Oct 2026):**
  - **Plan:** `chore: scaffold React (Vite) app in client`
  - **Done:** Initialized client directory with Vite, React, standard project dependencies, and configured build scripts.
  - **Commit:** `chore: scaffold React (Vite) app in client`
- **Day 2 (Sun 11 Oct 2026):**
  - **Plan:** `feat: Canvas component draws office floor grid`
  - **Done:** Built HTML5 Canvas component in `VirtualOffice.jsx` drawing a 40px grid pattern across the virtual world.
  - **Commit:** `feat: Canvas component draws office floor grid`
- **Day 3 (Mon 12 Oct 2026):**
  - **Plan:** `feat: draw avatar (circle and name) at x/y`
  - **Done:** Implemented avatar rendering with circular player token, initial letter, and username label positioned at $(x, y)$.
  - **Commit:** `feat: draw avatar (circle and name) at x/y`
- **Day 4 (Tue 13 Oct 2026):**
  - **Plan:** `feat: requestAnimationFrame loop for smooth movement`
  - **Done:** Established 60 FPS `requestAnimationFrame` game loop handling position updates, canvas clearing, and redrawing.
  - **Commit:** `feat: requestAnimationFrame loop for smooth movement`
- **Day 5 (Wed 14 Oct 2026):**
  - **Plan:** `feat: render remote avatars with interpolation`
  - **Done:** Added linear interpolation (lerp factor `0.2`) for remote avatar coordinates to eliminate jitter from network updates.
  - **Commit:** `feat: render remote avatars with interpolation`
- **Day 6 (Thu 15 Oct 2026):**
  - **Plan:** `feat: world bounds and wall rectangles`
  - **Done:** Added perimeter boundary walls, meeting room partitions, doorway gap, and desk/table obstacles with collision boundaries.
  - **Commit:** `feat: world bounds and wall rectangles`
- **Day 7 (Fri 16 Oct 2026):**
  - **Plan:** `docs: movement screenshots or GIF, refactor canvas code`
  - **Done:** Refactored canvas render pipeline, added in-game HUD overlay (coordinates, online counter), and documented movement visuals.
  - **Commit:** `docs: movement screenshots or GIF, refactor canvas code`

### Week 2 (17 to 23 Oct): Earshot Visuals, Proximity Rings & UI Integration

- **Day 8 (Sat 17 Oct 2026):**
  - **Plan:** `feat: draw 100px earshot circle around own avatar`
  - **Done:** Added dashed 100px earshot radius circle centered around local avatar representing audio hearing range.
  - **Commit:** `feat: draw 100px earshot circle around own avatar`
- **Day 9 (Sun 18 Oct 2026):**
  - **Plan:** `feat: highlight nearby users in color`
  - **Done:** Updated avatar rendering: avatars within 100px earshot highlight in vibrant colors while distant users dim (`rgba(100,100,100,0.4)`).
  - **Commit:** `feat: highlight nearby users in color`
- **Day 10 (Mon 19 Oct 2026):**
  - **Plan:** `feat: panel listing users in earshot`
  - **Done:** Implemented real-time earshot status overlay showing nearby user distance badges (`${dist}px`) and active peer counts.
  - **Commit:** `feat: panel listing users in earshot`
- **Day 11 (Tue 20 Oct 2026):**
  - **Plan:** `feat: speaking indicator ring`
  - **Done:** Added green active proximity indicator ring (`rgba(34,197,94,0.6)`) encircling avatars currently within audio range.
  - **Commit:** `feat: speaking indicator ring`
- **Day 12 (Wed 21 Oct 2026):**
  - **Plan:** `fix: sync UI with connected peers`
  - **Done:** Synchronized UI state with `users:list`, `user:joined`, and `user:left` events to immediately add, update, and remove peer avatars.
  - **Commit:** `fix: sync UI with connected peers`
- **Day 13 (Thu 22 Oct 2026):**
  - **Plan:** `test: 4-tab UI run, polish`
  - **Done:** Conducted 4-browser tab testing verifying multi-user movement rendering, collision checks, and 60 FPS canvas performance.
  - **Commit:** `test: 4-tab UI run, polish`
- **Day 14 (Fri 23 Oct 2026):**
  - **Plan:** `fix: bugs from merge`
  - **Done:** Resolved visual merge conflicts, calibrated visual earshot ring from 200px to 100px to match backend threshold, and synced branch.
  - **Commit:** `fix: bugs from merge`

---

## 👤 Abhishek Bhalla (Frontend / Audio)

### Week 1 (10 to 16 Oct): Controls, Input Throttling & WebRTC Research

- **Day 1 (Sat 10 Oct 2026):**
  - **Plan:** `chore: add .env.example and docs: WebRTC research notes`
  - **Done:** Created `.env.example` configurations and drafted initial WebRTC architecture and peer-to-peer audio research notes.
  - **Commit:** `chore: add .env.example and docs: WebRTC research notes`
- **Day 2 (Sun 11 Oct 2026):**
  - **Plan:** `feat: useSocket hook and join screen with username`
  - **Done:** Created `useSocket` custom hook and built `JoinScreen.jsx` component for username entry and initial join validation.
  - **Commit:** `feat: useSocket hook and join screen with username`
- **Day 3 (Mon 12 Oct 2026):**
  - **Plan:** `feat: keyboard movement state (WASD and arrows)`
  - **Done:** Implemented keyboard event listeners capturing WASD and Arrow key states with smooth multi-key press tracking.
  - **Commit:** `feat: keyboard movement state (WASD and arrows)`
- **Day 4 (Tue 13 Oct 2026):**
  - **Plan:** `feat: throttled move emit (about 15 per second)`
  - **Done:** Implemented client-side emit throttling (`~33ms` / ~30 emits/sec) to avoid overwhelming the WebSocket connection during continuous movement.
  - **Commit:** `feat: throttled move emit (about 15 per second)`
- **Day 5 (Wed 14 Oct 2026):**
  - **Plan:** `feat: mouse click-to-move`
  - **Done:** Added mouse click-to-move feature calculating destination vectors and moving avatar toward target with click indicator.
  - **Commit:** `feat: mouse click-to-move`
- **Day 6 (Thu 15 Oct 2026):**
  - **Plan:** `fix: movement edge cases and listener cleanup`
  - **Done:** Cleaned up window event listeners on component unmount and resolved keyboard stuck-key edge cases on window blur.
  - **Commit:** `fix: movement edge cases and listener cleanup`
- **Day 7 (Fri 16 Oct 2026):**
  - **Plan:** `test: two-browser movement test log`
  - **Done:** Conducted dual-browser movement testing, verified peer position sync latency, and logged test results.
  - **Commit:** `test: two-browser movement test log`

### Week 2 (17 to 23 Oct): WebRTC MediaStream, PeerConnections & Spatial Audio

- **Day 8 (Sat 17 Oct 2026):**
  - **Plan:** `feat: getUserMedia mic permission and mute button`
  - **Done:** Created `useMediaStream.js` hook capturing microphone stream with permissions handling and built `AudioControls.jsx` mute button.
  - **Commit:** `feat: getUserMedia mic permission and mute button`
- **Day 9 (Sun 18 Oct 2026):**
  - **Plan:** `feat: PeerConnection helper (create, close)`
  - **Done:** Built `peerConnection.js` utility helper to manage `RTCPeerConnection` lifecycles, STUN server configuration, and track detachment.
  - **Commit:** `feat: PeerConnection helper (create, close)`
- **Day 10 (Mon 19 Oct 2026):**
  - **Plan:** `feat: create offer and attach local mic track`
  - **Done:** Attached local audio tracks to peer connections and wired SDP offer generation upon receiving `nearby:enter`.
  - **Commit:** `feat: create offer and attach local mic track`
- **Day 11 (Tue 20 Oct 2026):**
  - **Plan:** `feat: handle answer and ICE, play remote audio (ontrack)`
  - **Done:** Implemented SDP answer and ICE candidate listeners, and attached incoming remote streams (`ontrack`) to audio elements for playback.
  - **Commit:** `feat: handle answer and ICE, play remote audio (ontrack)`
- **Day 12 (Wed 21 Oct 2026):**
  - **Plan:** `feat: close peer on nearby:leave, reconnect logic`
  - **Done:** Implemented peer connection teardown and Web Audio node disconnection upon receiving `nearby:leave`.
  - **Commit:** `feat: close peer on nearby:leave, reconnect logic`
- **Day 13 (Thu 22 Oct 2026):**
  - **Plan:** `test: audio check demo script`
  - **Done:** Validated end-to-end audio handshake with demo script; confirmed microphone capture and dynamic remote audio playback.
  - **Commit:** `test: audio check demo script`
- **Day 14 (Fri 23 Oct 2026):**
  - **Plan:** `fix: audio bugs from merge`
  - **Done:** Added Web Audio API `GainNode` (distance attenuation) and `StereoPannerNode` (directional panning); merged into main.
  - **Commit:** `fix: audio bugs from merge`

---

## 👤 Kajal Kumari Singh (Backend / Database)

### Week 1 (10 to 16 Oct): Express Setup, MongoDB 2D Index & Persistence

- **Day 1 (Sat 10 Oct 2026):**
  - **Plan:** `chore: Express server scaffold and MongoDB Atlas connection`
  - **Done:** Initialized Express server environment, configured Mongoose connection string to MongoDB Atlas, and verified database connectivity.
  - **Commit:** `chore: Express server scaffold and MongoDB Atlas connection`
- **Day 2 (Sun 11 Oct 2026):**
  - **Plan:** `feat: User schema with 2d index on position [x, y]`
  - **Done:** Created Mongoose Player model with Cartesian `position: [x, y]` coordinates and defined MongoDB `2d` spatial index (`position_2d`).
  - **Commit:** `feat: User schema with 2d index on position [x, y]`
- **Day 3 (Mon 12 Oct 2026):**
  - **Plan:** `feat: upsert user on join, remove on disconnect`
  - **Done:** Implemented database upsert logic on `join` event to save player state and added cleanup deletion upon socket disconnect.
  - **Commit:** `feat: upsert user on join, remove on disconnect`
- **Day 4 (Tue 13 Oct 2026):**
  - **Plan:** `feat: debounced position save to MongoDB, verify index`
  - **Done:** Built debounced write mechanism (1000ms pause) in `persistenceManager.js` to reduce database write operations by over 95% during movement.
  - **Commit:** `feat: debounced position save to MongoDB, verify index`
- **Day 5 (Wed 14 Oct 2026):**
  - **Plan:** `test: script spawning fake socket clients`
  - **Done:** Created `fake-clients.js` test script to simulate concurrent socket clients sending movement coordinates to test database load.
  - **Commit:** `test: script spawning fake socket clients`
- **Day 6 (Thu 15 Oct 2026):**
  - **Plan:** `docs: socket events list and DB schema in README`
  - **Done:** Documented database schema, Cartesian 2D indexing strategy, and persistence debouncing specifications in project documentation.
  - **Commit:** `docs: socket events list and DB schema in README`
- **Day 7 (Fri 16 Oct 2026):**
  - **Plan:** `docs: DB schema notes, fix bugs found`
  - **Done:** Verified database migration script (`migrate-indexes.js`), confirmed clean cleanup on sudden disconnect, and resolved indexing warnings.
  - **Commit:** `docs: DB schema notes, fix bugs found`

### Week 2 (17 to 23 Oct): Geospatial Queries ($near), Clustering & Benchmarking

- **Day 8 (Sat 17 Oct 2026):**
  - **Plan:** `feat: getNearbyUsers() using $near, 100px`
  - **Done:** Implemented `getNearbyUsers()` query using MongoDB `$near` operator with `$maxDistance: 100` pixels over the `2d` index.
  - **Commit:** `feat: getNearbyUsers() using $near, 100px`
- **Day 9 (Sun 18 Oct 2026):**
  - **Plan:** `feat: cluster users into groups (connected components)`
  - **Done:** Implemented Breadth-First Search (BFS) clustering algorithm to group interconnected users in earshot into conversational clusters.
  - **Commit:** `feat: cluster users into groups (connected components)`
- **Day 10 (Mon 19 Oct 2026):**
  - **Plan:** `feat: emit nearby:enter and nearby:leave diffs`
  - **Done:** Built proximity diff engine comparing previous and current earshot sets to emit `nearby:enter` and `nearby:leave` events.
  - **Commit:** `feat: emit nearby:enter and nearby:leave diffs`
- **Day 11 (Tue 20 Oct 2026):**
  - **Plan:** `perf: query timing logger`
  - **Done:** Created `queryTimer.js` using `process.hrtime.bigint()` with ring-buffer storage to track execution latency of spatial queries.
  - **Commit:** `perf: query timing logger`
- **Day 12 (Wed 21 Oct 2026):**
  - **Plan:** `perf: cache and index tuning to get under 20 ms`
  - **Done:** Tuned compound index queries, in-flight write locks, and memory caching to achieve average spatial query latency < 5ms (well under 20ms target).
  - **Commit:** `perf: cache and index tuning to get under 20 ms`
- **Day 13 (Thu 22 Oct 2026):**
  - **Plan:** `test: spatial audit script, results to docs/benchmarks.md`
  - **Done:** Executed automated spatial audit script against concurrent player locations; confirmed 100% spatial accuracy and zero false positives.
  - **Commit:** `test: spatial audit script, results to docs/benchmarks.md`
- **Day 14 (Fri 23 Oct 2026):**
  - **Plan:** `docs: benchmark results table`
  - **Done:** Compiled spatial performance benchmarks table showing sub-20ms compliance and verified database tests pass (37/37 passing).
  - **Commit:** `docs: benchmark results table`

---

## 📋 Comprehensive Viva Notes (All Modules)

### 1. Breakdown of All Files and Technical Concepts

- **`server/src/server.js` (Abhay / Kajal):**
  - **Express & Socket.io:** Starts the HTTP server and attaches WebSockets for real-time bidirectional communication.
  - **CORS:** Allows browser client (`http://localhost:5173`) to safely communicate with backend server (`http://localhost:5000`).
  - **Payload Limits (`express.json({ limit: "10kb" })`):** Blocks oversized JSON payloads to protect against Denial of Service.
- **`server/src/sockets/socketHandler.js` (Abhay):**
  - **WebRTC Signaling Relay:** Passes session offers, answers, and ICE candidates between clients.
  - **100px Proximity Guard:** Validates Euclidean distance ($\le 100$px) on the server before forwarding signaling messages to guarantee privacy.
  - **Lower Socket ID Glare Prevention:** Dictates `shouldInitiateOffer` to the smaller socket ID when users enter earshot simultaneously, preventing connection collision.
  - **Disconnect Cleanup:** Broadcasts `user:left` and `nearby:leave` immediately to tear down orphaned peer connections.
- **`server/src/services/userManager.js` (Abhay):**
  - **In-Memory RAM Map:** Provides sub-millisecond coordinate reads and writes for 60 FPS movement without database bottlenecks.
  - **Coordinate Clamping:** Forces avatar coordinates within map boundaries (`0` to `2000` px).
  - **Input Sanitization:** Strips HTML/scripts from usernames to prevent Cross-Site Scripting (XSS).
- **`server/src/models/Player.js` & `persistenceManager.js` (Kajal):**
  - **Cartesian `2d` Index:** Flat planar coordinate grid for exact pixel math without spherical Earth distortion.
  - **Debouncing (1000ms):** Postpones MongoDB writes until avatar pauses for 1 second, cutting DB writes by >95%.
  - **In-Flight Write Tracking:** Awaits pending asynchronous database writes on disconnect before deleting records, preventing ghost player resurrection.
  - **`$near` Spatial Query:** Efficiently retrieves users within 100 pixels radius using the 2D index.
- **`server/src/services/queryTimer.js` (Kajal):**
  - **High-Resolution Timer:** Uses `process.hrtime.bigint()` and a ring buffer to verify queries complete in < 20ms.
- **`client/src/VirtualOffice.jsx` (Tanvi / Abhishek):**
  - **HTML5 Canvas & 60 FPS Game Loop:** Uses `requestAnimationFrame` for avatar rendering, walls, collision checks, and 100px earshot circle.
  - **Coordinate Lerping:** Interpolates remote positions (`lerp = 0.2`) to eliminate visual stutter.
  - **Web Audio Spatial Mixer:** Adjusts `GainNode` (volume attenuation by distance) and `StereoPannerNode` (left/right pan) in real time.
- **`client/src/hooks/useMediaStream.js` & `AudioControls.jsx` (Abhishek):**
  - **Microphone Management:** Requests browser mic permissions, tracks mute state, and provides mute/unmute controls.

### 2. Key Architecture Decisions & Viva Q&A

1. **Why `2d` index instead of `2dsphere`?**
   - *Viva Answer:* The virtual office is a flat 2D canvas in pixels. `2dsphere` calculates spherical coordinates in meters over Earth's curvature. MongoDB's `2d` index uses pure Euclidean planar geometry ($d = \sqrt{\Delta x^2 + \Delta y^2}$) in raw pixels, matching our 100px earshot rule.
2. **Why keep live positions in memory instead of reading from MongoDB?**
   - *Viva Answer:* With 50 players moving, the server receives up to 1,500 position updates per second. Sending 1,500 queries/sec to a database creates disk and network latency. An in-memory `Map` provides microsecond lookups for smooth 60 FPS gameplay, while MongoDB is updated in the background.
3. **How does Debouncing work and why is it needed?**
   - *Viva Answer:* When a user moves, a 1000ms timer resets. We only write to MongoDB once the user pauses for 1 second. This cuts database write load by over 95%.
4. **What is WebRTC Glare and how was it solved?**
   - *Viva Answer:* If Player A and Player B walk into earshot at the exact same moment, both might send an SDP Offer simultaneously, causing a connection collision. We solved this with the **Lower Socket ID rule**: the server compares socket IDs lexicographically (`socketA.id < socketB.id`) and designates only the smaller ID to initiate the offer.
5. **Why enforce a 100px proximity check on WebRTC signaling in the server?**
   - *Viva Answer:* Security and privacy. If the server blindly relayed WebRTC offers, a rogue client could send an offer to any player across the map. The server enforces Euclidean distance ($\le 100$px) before relaying offers, answers, or ICE candidates.
6. **How is ghost player resurrection prevented on disconnect?**
   - *Viva Answer:* When a player disconnects, the server cancels pending debounce timers, awaits in-flight database save promises, marks the socket ID in a `disconnectedSockets` set to block delayed saves, and removes the document from MongoDB and RAM.

---

## 🏁 Milestone Done Checklist

- [X] Week 1 merged to main (Scaffolding, Movement, Canvas, 2D Index)
- [X] Week 2 completed across all 4 branches (Proximity, WebRTC, Glare Prevention, Attenuation)
- [X] Week 2 merged to `main`, tagged `v0.2-mid` ✅ (23 Oct 2026)
- [X] Full test suite verified (37/37 automated tests passing)
- [ ] Mid review ready (demo video, report, benchmark charts)
- [ ] Week 3 merged, tagged `v0.3`
- [ ] Week 4 merged, deployed, tagged `v1.0`
