# 06 - Team Progress Log (Cumulative: Week 1 & Week 2)

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
