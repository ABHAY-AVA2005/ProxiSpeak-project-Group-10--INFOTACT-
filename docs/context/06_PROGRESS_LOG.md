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
- Problems / fixes: Integrated Kajal's database persistence, debouncing logic, and migration tools into the modular ES Module server architecture.
- Tomorrow (Day 5): feat: render remote avatars with interpolation, test: script spawning fake socket clients

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
- [ ] Week 1 merged to main
- [ ] Week 2 merged, tag v0.2-mid
- [ ] Mid review ready (docs, benchmarks, video)
- [ ] Week 3 merged, tag v0.3
- [ ] Week 4 merged, deployed, tag v1.0
- [ ] Final review ready (report, PPT, video)
