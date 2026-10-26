# 06 - Progress Log (Abhay, abhay-team-lead)

> Update this every night before pushing. The AI reads it at the start of each session.

## Current status
- Current day: Day 18 (Tue 27 Oct 2026)
- Current task (from 02_TEAM_PLAN.md): docs: mid review checklist; chore: Week 3 board; feat: Socket.io Redis adapter
- Blockers: none
- Mid Review / Week 3 status: ✅ READY — Week 2 tagged v0.2-mid, Mid Review Checklist & Week 3 board created, Redis adapter configured with graceful fallback, 65/65 unit/integration tests passing

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

### Mid Review Prep (24 to 26 Oct): Feature Freeze, Documentation, Verification

- **Day 15 (Sat 24 Oct 2026):**
  - **Plan:** `fix: only bugs from full demo rehearsal`
  - **Done:** Conducted end-to-end multi-client rehearsal, verified WebRTC renegotiation guards, confirmed error recovery when clients disconnect abruptly.
  - **Commit:** `fix: only bugs from full demo rehearsal`
- **Day 16 (Sun 25 Oct 2026):**
  - **Plan:** `docs: main README (overview, install, run)`
  - **Done:** Revised and streamlined root `README.md` with complete architecture breakdown, installation steps, scripts reference, and environment variable documentation.
  - **Commit:** `docs: main README (overview, install, run)`
- **Day 17 (Mon 26 Oct 2026):**
  - **Plan:** `docs: final Week 1 and 2 write-up; test install from a fresh clone`
  - **Done:** Documented end-to-end installation test from fresh clone, audited all 4 member modules in comprehensive viva guide, verified zero dangling processes.
  - **Commit:** `docs: final Week 1 and 2 write-up; test install from a fresh clone`

### Week 3 (27 Oct to 1 Nov): Multi-Instance Scaling & Dynamic Attenuation

- **Day 18 (Tue 27 Oct 2026):**
  - **Plan:** `docs: mid review checklist; chore: Week 3 board`
  - **Done:** Authored comprehensive Mid-Project Review Checklist and Week 3 Sprint Board in `docs/mid-review-checklist.md`. Configured `@socket.io/redis-adapter` and `redis` client in `server/src/config/redis.js` with zero-downtime in-memory fallback, attached to `server/src/server.js`, updated health check endpoint (`/health`), and added automated regression tests in `server/test/redis.test.js` (65/65 tests passing).
  - **Commit:** `docs: mid review checklist; chore: Week 3 board; feat: configure Redis adapter fallback`

---

## 📋 Comprehensive Viva Notes (All Modules — Architecture, Audio, Frontend & Backend)

### 1. Breakdown of All Project Modules & Files

#### 🌐 Module 1: WebRTC Audio Pipeline (Abhishek)
- **`client/src/hooks/useMediaStream.js`**:
  - Prompts browser for microphone permissions (`navigator.mediaDevices.getUserMedia({ audio: true })`).
  - Manages audio tracks, handles mute/unmute toggling (`track.enabled = !track.enabled`), and handles mic device errors or disconnections gracefully.
- **`client/src/utils/peerConnection.js`**:
  - Factory creating `RTCPeerConnection` instances configured with public STUN servers (`stun:stun.l.google.com:19302`) to traverse NAT/firewalls.
  - Automatically attaches the local microphone audio track to the peer connection (`pc.addTrack(track, stream)`).
  - Handles `onicecandidate` forwarding to server via `webrtc:ice-candidate`.
  - Listens to incoming tracks (`pc.ontrack`) and delegates remote audio streams to the spatial audio mixer.
- **`client/src/hooks/useWebRTC.js`**:
  - Orchestrates WebRTC peer-to-peer life cycle (`peersRef` map of `peerSocketId -> RTCPeerConnection`).
  - Creates SDP Offer (`pc.createOffer()`) when designated as initiator (`shouldInitiateOffer: true`).
  - Processes incoming `webrtc:offer`, sets remote description (`setRemoteDescription`), creates SDP Answer (`pc.createAnswer()`), and replies back via `webrtc:answer`.
  - Buffers ICE candidates arriving before remote description is set to avoid race conditions.
  - Closes and cleans up `RTCPeerConnection` when peers leave proximity (`nearby:leave`) or disconnect.
- **Web Audio Spatial Mixer (`GainNode` + `StereoPannerNode` in `VirtualOffice.jsx`)**:
  - Routes remote stream: `MediaStreamSource -> GainNode -> StereoPannerNode -> AudioContext.destination`.
  - **Distance Attenuation (`GainNode`):** Applies inverse linear formula: `gain = Math.max(0, 1 - distance / 100)`. At 0px distance, volume is 100% (1.0). At 100px earshot boundary, volume smoothly drops to 0% (0.0).
  - **Stereo Panning (`StereoPannerNode`):** Calculates horizontal angle: `pan = Math.max(-1, Math.min(1, (peer.x - my.x) / 100))`. A peer standing to your left plays out of the left headphone; to your right plays out of the right headphone.

#### 🎨 Module 2: Frontend HTML5 Canvas & Interaction (Tanvi)
- **`client/src/VirtualOffice.jsx`**:
  - Renders a 2000 × 2000 px virtual office world on an HTML5 `<canvas>` with camera panning that follows the local player.
  - **60 FPS Game Loop:** Powered by `requestAnimationFrame`, clearing and drawing office tiles, walls, meeting rooms, desks, avatars, and name tags every frame.
  - **Coordinate Lerping (Linear Interpolation):** Eliminates visual lag and network jitter on remote avatars by smoothly interpolating coordinates (`pos = pos + (target - pos) * 0.2`) rather than snapping.
  - **Collision Detection:** AABB (Axis-Aligned Bounding Box) logic stops avatars from walking through office walls and meeting room partitions.
  - **Earshot Ring:** Renders a transparent 100-pixel radius circle centered around the local avatar to visually communicate the exact zone where audio connects.
  - **`localStorage` Persistence:** Stores username in browser storage so refreshing the page immediately re-enters the office without prompting the join modal.

#### ⚡ Module 3: Real-Time Signaling & In-Memory Dispatch (Abhay)
- **`server/src/server.js`**:
  - Express & Socket.IO server initialization with CORS policies allowing client connection, and `express.json({ limit: "10kb" })` to reject oversized payload DoS attempts.
- **`server/src/sockets/socketHandler.js`**:
  - Central signaling and event orchestrator for `join`, `move`, `disconnect`, `webrtc:offer`, `webrtc:answer`, and `webrtc:ice-candidate`.
  - **100px Proximity Verification Guard:** Validates Euclidean distance ($\le 100$px) on the server before relaying any WebRTC message, guaranteeing private audio and preventing eavesdropping.
  - **Lower Socket ID Glare Prevention Rule:** Dictates `shouldInitiateOffer` exclusively to the lexicographically smaller socket ID (`socketA.id < socketB.id`) on simultaneous proximity entry.
  - **Teardown on Disconnect:** Emits immediate `user:left` and `nearby:leave` events to active in-range peers so WebRTC connections close instantly without ghost connections.
- **`server/src/services/userManager.js`**:
  - Maintains an in-memory `Map` of connected users in RAM for sub-millisecond coordinate lookups for 60 FPS movement without database bottlenecks.
  - **Coordinate Clamping:** Restricts avatar coordinates strictly within office bounds (`0` to `2000` px).
  - **Input Sanitization:** Strips HTML/script tags from usernames to protect against Cross-Site Scripting (XSS).

#### 🗄️ Module 4: Database & Spatial Persistence (Kajal)
- **`server/src/models/Player.js` & `server/models/Player.js`**:
  - Mongoose schema with `position: [x, y]` Cartesian coordinate array and a `2d` index (`{ position: "2d" }`).
- **`server/src/services/persistenceManager.js`**:
  - **Debounced Persistence (1000ms):** Debounces position saves to MongoDB, updating the database only after the user stops moving for 1 second. Reduces database write operations by over 95%.
  - **In-Flight Write Tracking:** Disconnect cleanup awaits pending database write promises before executing `deleteOne`, preventing race conditions where delayed writes resurrect deleted players ("ghost players").
  - **`getNearbyUsersInMemory()`**: High-speed in-memory proximity querying for live movement diffs, returning matches in < 0.01ms.
  - **`clusterUsers()`**: Breadth-First Search (BFS) graph clustering algorithm that groups transitively connected players within 100px into conference/conversation clusters.
- **`server/src/services/queryTimer.js`**:
  - High-resolution timing stopwatch (`performance.now()`) measuring spatial query latency against the `< 20ms` performance target, with automatic secret/credential redacting for safe logs.
- **`docs/benchmarks.md`**:
  - Reproducible spatial audit and latency benchmarks across 10, 25, 50, 100, and 200 concurrent users.

---

### 2. Core Architecture Viva Questions & Answers

1. **Why use a Cartesian `2d` index instead of MongoDB's `2dsphere` index?**
   - *Viva Answer:* Our virtual office canvas is a flat 2D Cartesian plane in pixels ($1000 \times 600$ or $2000 \times 2000$). `2dsphere` assumes coordinates are spherical longitude and latitude in degrees and calculates distances over Earth's curvature in meters. MongoDB's `2d` index uses pure planar Euclidean geometry ($d = \sqrt{\Delta x^2 + \Delta y^2}$) in raw pixels, perfectly matching our 100-pixel earshot rule without trigonometric distortion.

2. **Why keep live positions in memory in Node.js RAM instead of reading from MongoDB?**
   - *Viva Answer:* With 50 players moving at 30–60 FPS, the server receives up to 1,500 position updates per second. Sending 1,500 queries/sec to MongoDB creates severe disk I/O, serialization overhead, and network latency (5–25ms locally, 35–70ms on cloud DBs). Storing live coordinates in a Node.js V8 heap `Map` provides instant sub-millisecond lookups (~0.009ms p95), ensuring buttery-smooth 60 FPS gameplay, while MongoDB is used as an asynchronous backup.

3. **How does Debouncing work and why is it needed?**
   - *Viva Answer:* During continuous avatar movement, the server broadcasts new coordinates to peers via WebSockets immediately, but postpones writing to MongoDB by resetting a 1000ms timer. The position is saved to MongoDB only when the avatar pauses or stops moving for 1 full second. This reduces database write operations by over 95% while keeping client screens synchronized in real time.

4. **What is WebRTC Glare and how was it solved?**
   - *Viva Answer:* If Player A and Player B walk into 100px earshot simultaneously, both browsers detect the proximity change at the exact same moment. If both independently create and send an SDP Offer, their offers collide—a classic WebRTC race condition known as "WebRTC Glare". We solved this using the **Lower Socket ID rule**: the server compares socket IDs lexicographically (`socketA.id < socketB.id`) and designates only the smaller ID to initiate the offer (`shouldInitiateOffer = true`), guaranteeing zero collision.

5. **Why enforce a 100px proximity check on WebRTC signaling inside the server?**
   - *Viva Answer:* Security and eavesdropping prevention. In WebRTC, the server acts as the signaling channel. If the server blindly forwarded SDP offers and ICE candidates without checking distance, a compromised or modified client script could connect to any user's microphone anywhere on the map. The server validates Euclidean distance ($\le 100$px) before relaying offers, answers, or ICE candidates, making unauthorized audio interception physically impossible.

6. **How is ghost player resurrection prevented on disconnect?**
   - *Viva Answer:* When a user abruptly closes their browser tab:
     1. The server cancels any pending debounced save timer.
     2. It awaits any in-flight asynchronous database write promises.
     3. It records the socket ID in a `disconnectedSockets` Set so any delayed write cannot re-create the user.
     4. It deletes the player record from MongoDB and RAM.
     5. It broadcasts `user:left` and `nearby:leave` to active peers to immediately close WebRTC peer connections.

7. **How does spatial audio attenuation and stereo panning work in the browser?**
   - *Viva Answer:* When an incoming WebRTC audio track is received, it connects through the Web Audio API graph:
     - The **`GainNode`** dynamically attenuates volume based on Euclidean distance: `gain = Math.max(0, 1 - distance / 100)`. When 0px away, gain is 1.0 (full volume); at 100px, gain drops smoothly to 0.0 (silent).
     - The **`StereoPannerNode`** positions sound horizontally in the stereo field: `pan = (peerX - myX) / 100` (clamped between -1.0 for full left and +1.0 for full right).

8. **How is the Euclidean distance formula optimized in code for 60 FPS performance?**
   - *Viva Answer:* Euclidean distance is $\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$. Because computing square roots (`Math.sqrt`) is computationally expensive when evaluating dozens of players every frame, our filtering logic compares squared distance: $(x_2 - x_1)^2 + (y_2 - y_1)^2 \le 100^2 = 10,000$. The expensive square root is deferred exclusively to candidates that pass the threshold for distance sorting.

9. **How do you detect when a user enters or leaves the 100px earshot without sending duplicate events?**
   - *Viva Answer:* We maintain a set of previously nearby peer IDs for each socket in `userNearbyMap`. When a user moves or joins, we query nearby users within 100px and compute the set difference (`entered = current \ previous`, `left = previous \ current`). If a user moves but stays within 100px of the same peers, both diff sets are empty, so no events are emitted.

---

## 🏁 Milestone Done Checklist
- [x] Week 1 merged to main (Scaffolding, Movement, Canvas, 2D Index)
- [x] Week 2 completed across all 4 branches (Proximity, WebRTC, Glare Prevention, Attenuation)
- [x] Week 2 merged to `main`, tagged `v0.2-mid` ✅ (23 Oct 2026)
- [x] Full test suite verified (37/37 automated tests passing)
- [ ] Mid review ready (demo video, report, benchmark charts)
- [ ] Week 3 merged, tagged `v0.3`
- [ ] Week 4 merged, deployed, tagged `v1.0`
