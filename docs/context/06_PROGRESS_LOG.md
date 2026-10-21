# 06 - Progress Log (Abhay, abhay-team-lead)

> Update this every night before pushing. The AI reads it at the start of each session.

## Current status
- Current day: Day 6 (Thu 15 Oct 2026)
- Current task (from 02_TEAM_PLAN.md): chore: review and merge Week 1 branches into main
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
### Day 4 - Tue 13 Oct 2026
- Planned: feat: move event broadcasts x/y to everyone; debounced position save to MongoDB, verify index
- Done:
  - Replaced GeoJSON `location` field and `2dsphere` index with flat Cartesian `position: [x, y]` and `2d` geospatial index in Mongoose Player model.
  - Implemented real-time position broadcast via WebSockets (`move` / `player-move` -> `user:moved` / `player-moved`) with zero DB latency for 60 FPS movement.
  - Debounced MongoDB writes (1000ms delay per player) in persistenceManager service to reduce write overhead by over 95%.
  - Added race-condition guards on player disconnect: clears pending debounce timers, persists latest position if pending, awaits in-flight writes, and removes document.
  - Added index migration script in `server/src/scripts/migrate-indexes.js` to ensure the `position_2d` index exists and remove legacy `location_2dsphere`.
  - Added automated test suite in `server/test/persistence.test.js` verifying schema indexes, coordinate clamping, and debounce/disconnect guards.
- Files changed: server/src/models/Player.js, server/src/services/persistenceManager.js, server/src/sockets/socketHandler.js, server/src/scripts/migrate-indexes.js, server/test/persistence.test.js
- Commit message(s): feat: move event broadcast and debounced position save to MongoDB
### Day 5 - Wed 14 Oct 2026
- Planned: fix: server-side coordinate bounds validation
- Done:
  - Implemented server-side coordinate clamping (`clampCoordinate`) and sanitize username safeguards against XSS in `server/src/services/userManager.js`.
  - Added world boundaries constants (`0` to `2000` px) with fallback defaults.
  - Verified and integrated `server/src/scripts/fake-clients.js` simulation tool for concurrent Socket.io client stress testing.
- Files changed: server/src/services/userManager.js, server/src/scripts/fake-clients.js
- Commit message(s): fix: server-side coordinate bounds validation and fake client runner
- Problems / fixes: None
- Tomorrow (Day 6): chore: review and merge Week 1 branches into main

### Day 6 - Thu 15 Oct 2026
- Planned: chore: review and merge Week 1 branches into main
- Done:
  - Conducted Week 1 branch review and integration audits across `tanvi-frontend`, `abhishek-audio`, and `kajal-backend`.
  - Verified node test suite runs cleanly (`npm test` 3/3 passing) verifying spatial index, position clamping, and debounced persistence.
  - Documented server scripts, architecture, and Socket.IO protocol events in README.md.
  - Synchronized and verified team lead branch against `origin/main`.
- Files changed: docs/context/06_PROGRESS_LOG.md, README.md
- Commit message(s): chore: review Week 1 branches and update documentation
- Problems / fixes: None
### Day 7 - Fri 16 Oct 2026
- Planned: docs: Week 1 write-up draft, tag v0.1
- Done:
  - Validated full test suite (server 3/3 passing, client build passing).
  - Merged integrated Week 1 frontend, backend, movement, and audio scaffolding into main.
  - Tagged release v0.1 marking completion of Week 1 milestones.
  - Synced main back into member branches (`tanvi-frontend`, `abhishek-audio`, `kajal-backend`).
- Files changed: docs/context/06_PROGRESS_LOG.md
- Commit message(s): chore: merge Week 1 branches into main, tag v0.1, sync member branches
- Problems / fixes: None
- Tomorrow (Day 8): feat: signaling event names and relay skeleton (offer, answer, ice)

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

<!-- Copy the block above for each new day. -->

## Viva notes (add as you go)
- What each file does in simple words:
  - `server/src/server.js`: Starts Express HTTP and Socket.io server, applies CORS and parses JSON.
  - `server/src/sockets/socketHandler.js`: Central Socket.io hub handling connection, movement, and disconnect events.
  - `server/src/services/userManager.js`: Fast in-memory Map storing connected active users (socketId, username, position [x, y]).
  - `server/src/services/persistenceManager.js`: Handles debounced persistence to MongoDB, in-flight promise tracking, and safe disconnect cleanup.
  - `server/src/models/Player.js`: Mongoose model with Cartesian `position: [x, y]` and a `2d` index.
  - `server/src/scripts/migrate-indexes.js`: Standalone script to inspect and migrate MongoDB geospatial indexes.
- Key decisions and why (2d index, throttling, mesh cap, lower-id offer rule):
  - **2D index vs 2dsphere**: The office is a flat Cartesian 2D grid in pixels. `2dsphere` calculates spherical distance on earth coordinates, whereas legacy `2d` index works directly with Euclidean distance (`$near` with `$maxDistance: 100` pixels).
  - **Debouncing**: Avatars move at 30-60 updates per second. Emitting real-time updates over WebSockets maintains 60 FPS, while debouncing MongoDB writes by 1 second reduces database I/O by over 95%.
  - **Disconnect safety**: When a user leaves, debounce timers are cleared, active in-flight writes are awaited before `deleteOne` runs, and `disconnectedSockets` prevents async operations from resurrecting deleted records.
- Questions I should be ready for:
  - Why keep live coordinates in memory instead of reading from DB? Database roundtrips add latency and high I/O overhead; in-memory lookup is sub-millisecond.
  - Why not write to MongoDB on every move? Because real-time broadcast must happen immediately (zero latency, 60 FPS), but disk/network DB I/O would bottleneck the system under multi-user load.
  - Does changing Mongoose schema delete old indexes in MongoDB? No, Mongoose only creates indexes; obsolete database indexes must be dropped explicitly using a migration script or mongosh.

## Done checklist
- [x] Week 1 merged to main
- [ ] Week 2 merged, tag v0.2-mid
- [ ] Mid review ready (docs, benchmarks, video)
- [ ] Week 3 merged, tag v0.3
- [ ] Week 4 merged, deployed, tag v1.0
- [ ] Final review ready (report, PPT, video)
