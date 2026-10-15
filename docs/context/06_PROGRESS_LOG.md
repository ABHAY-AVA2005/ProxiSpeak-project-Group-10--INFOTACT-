06 - Progress Log (Abhay, abhay-team-lead)

Update this every night before pushing. The AI reads it at the start of each session.

Current status

Current day: Day 3 (Mon 12 Oct 2026)

Current task (from 02_TEAM_PLAN.md): feat: join event, in-memory users, broadcast users

Blockers: none

Daily entries

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

Done: Created in-memory user manager service and wired join, users:list, user:joined, and user:left events in Socket.io handler.

Files changed: server/src/services/userManager.js, server/src/sockets/socketHandler.js

Commit message(s): feat: join event, in-memory users, broadcast users

Problems / fixes: None

Day 4 - Tue 13 Oct 2026

Planned: feat: move event broadcasts x/y to everyone; debounced position save to MongoDB, verify index

Done:

Replaced GeoJSON location field and 2dsphere index with flat Cartesian position: [x, y] and 2d geospatial index in Mongoose Player model.

Implemented real-time position broadcast via WebSockets (move / player-move -> user:moved / player-moved) with zero DB latency for 60 FPS movement.

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

Added npm command "test:clients" running node scripts/fake-clients.js.

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

Tomorrow (Day 6): docs: socket events list and DB schema in README

<!-- Copy the block above for each new day. -->

Viva notes (add as you go)

What each file does in simple words:

server/src/server.js: Starts the Express HTTP and Socket.IO server, applies CORS, and parses JSON.

server/src/sockets/socketHandler.js: Central Socket.IO handler for connections, join events, movement broadcasts, and disconnect events.

server/src/services/userManager.js: Maintains an in-memory Map of connected users, including socket ID, username, and position.

server/src/services/persistenceManager.js: Handles debounced MongoDB persistence, in-flight write tracking, and safe disconnect cleanup.

server/src/models/Player.js: Defines the Mongoose Player schema with Cartesian position: [x, y] and a 2d geospatial index.

server/models/Player.js: Legacy Player model used by the existing CommonJS backend.

server/utils/validation.js: Validates coordinates against the 1000x600 canvas boundaries and protects against invalid or out-of-range values.

server/server.js: Legacy Express and Socket.IO server handling movement broadcasts, debounced MongoDB writes, and disconnect cleanup.

server/scripts/migrate-indexes.js: Legacy index migration script for managing MongoDB geospatial indexes.

server/src/scripts/migrate-indexes.js: ES-module migration script for inspecting and updating MongoDB geospatial indexes.

server/scripts/fake-clients.js: Spawns configurable Socket.IO clients to test concurrent connections, movement broadcasts, and disconnect behavior.

server/test/debounce-index.test.js: Tests coordinate validation, debounced persistence, disconnect cleanup, and schema index definitions.

server/test/persistence.test.js: Tests schema indexes, coordinate clamping, and persistence/disconnect safeguards.

Key decisions and why (2d index, debouncing, disconnect cleanup, in-memory map):

In-memory Map: Keeps connected users' current positions available without querying MongoDB for every movement update.

2D index vs. 2dsphere: The virtual office is a flat 1000x600 pixel grid. A 2d index is appropriate for Cartesian coordinates, while 2dsphere is designed for geographic coordinates.

Debouncing: Movement updates are broadcast immediately, while MongoDB writes are delayed to reduce unnecessary database operations.

Disconnect safety: Pending timers are cleared, in-flight writes are awaited where necessary, and asynchronous operations are guarded to prevent deleted player records from being recreated.

Movement interpolation: Remote avatar positions are interpolated between received updates to make movement appear smoother.

Socket.IO compatibility: The client currently listens for both legacy event names and the newer event names so it can interoperate with the respective server handlers.

Questions I should be ready for:

Why keep live coordinates in memory instead of reading from the database? In-memory access avoids a database round trip for every real-time movement update.

Why not write to MongoDB on every move? Frequent database writes would add overhead to a high-frequency movement stream. Debouncing reduces that overhead while keeping movement broadcasts responsive.

Does changing a Mongoose schema automatically delete an old database index? No. Obsolete indexes must be removed explicitly through a migration or database command.

Why use a 2d index instead of a 2dsphere index? The virtual office uses flat pixel coordinates rather than geographic coordinates.

Why interpolate remote player positions? Interpolation smooths the visual movement between network updates.

Done checklist

Week 1 merged to main

Week 2 merged, tag v0.2-mid

Mid review ready (docs, benchmarks, video)

Week 3 merged, tag v0.3

Week 4 merged, deployed, tag v1.0

Final review ready (report, PPT, video)