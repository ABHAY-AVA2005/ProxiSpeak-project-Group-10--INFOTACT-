# 06 - Progress Log (Abhay Varshit Aripirala, Team Lead)

> Daily day-wise progress log, weekly breakdown, architecture notes, and complete mid-review viva preparation guide.

## Current Status
- **Current Day:** Day 20 (Thu 29 Oct 2026)
- **Current Role:** Team Lead & Backend (Signaling, WebSockets, WebRTC Relay, Multi-Instance Scaling)
- **Current Task:** `feat: run 2 Node instances, test cross-instance messages; chore: one-click executable launchers`
- **Blockers:** None
- **Test Suite:** ✅ 66/66 automated tests passing (`test/**/*.test.js`), full regression suite verified
- **Mid Review / Week 3 Status:** ✅ READY — Week 2 tagged `v0.2-mid`, Week 3 multi-instance tests written and verified, one-click Windows batch launchers (`start.bat` & `start-multi.bat`) configured.

---

## 👤 Abhay Varshit Aripirala — Day-Wise Contribution Log

### Week 1 (10 to 16 Oct): Signaling, Movement, World Bounds & Canvas Integration
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
  - **Done:** Stepped in to finalize and integrate frontend canvas work (`feat(client): complete Tanvi Week 1 frontend - grid, named avatars, walls, lerp, click-to-move, HUD`). Conducted audits, resolved merge conflicts, and standardized socket events.
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
  - **Done:** Performed 2-browser audio connection run and verified real-time WebRTC handshake under proximity constraints. Integrated Abhishek's audio and Tanvi's earshot ring (`100px`).
  - **Commit:** `test: 2-browser audio connection run, fixes`
- **Day 14 (Fri 23 Oct 2026):**
  - **Plan:** `chore: merge Week 2 branches, tag v0.2-mid`
  - **Done:** Merged Week 2 branches into `main`. Tagged release `v0.2-mid`, pushed to remote, and verified test suite.
  - **Commit:** `chore: merge Week 2 branches, tag v0.2-mid`

### Mid Review Prep & Week 3 (24 to 29 Oct): Scaling, Multi-Instance & Batch Launchers
- **Day 15 (Sat 24 Oct 2026):**
  - **Plan:** `fix: only bugs from full demo rehearsal`
  - **Done:** Rehearsed end-to-end multi-client simulation, verified WebRTC renegotiation guards, confirmed error recovery when clients disconnect abruptly.
- **Day 16 (Sun 25 Oct 2026):**
  - **Plan:** `docs: main README (overview, install, run)`
  - **Done:** Streamlined root `README.md` with complete architecture breakdown, installation steps, scripts reference, and environment variable documentation.
- **Day 17 (Mon 26 Oct 2026):**
  - **Plan:** `docs: final Week 1 and 2 write-up; test install from a fresh clone`
  - **Done:** Documented end-to-end installation test from fresh clone, audited all 4 member modules in comprehensive viva guide, verified zero dangling processes.
- **Day 18 (Tue 27 Oct 2026):**
  - **Plan:** `docs: mid review checklist; chore: Week 3 board`
  - **Done:** Authored Mid-Project Review Checklist and Week 3 Sprint Board in `docs/mid-review-checklist.md`. Configured `@socket.io/redis-adapter` in `server/src/config/redis.js` with zero-downtime in-memory fallback, attached to `server/src/server.js`, updated health check endpoint (`/health`), and verified tests.
- **Day 19 (Wed 28 Oct 2026):**
  - **Plan:** `feat: Socket.io Redis adapter`
  - **Done:** Validated graceful fallback when Redis is absent and verified clean shutdown teardown without unhandled rejections.
- **Day 20 (Thu 29 Oct 2026) — TODAY:**
  - **Plan:** `feat: run 2 Node instances, test cross-instance messages; chore: one-click executable launchers`
  - **Done:**
    1. Built multi-instance verification test script `server/scripts/test-multi-instance.js` and automated test `server/test/multiInstance.test.js` demonstrating 2 Node.js servers starting on different ports (5101/5102), handling independent client joins and message dispatch.
    2. Created Windows one-click executable batch launcher `start.bat` for automatic node verification, dependency installation, and parallel launching of backend and frontend.
    3. Created dual-instance multi-server runner `start-multi.bat` to launch Instance 1 (port 5000) and Instance 2 (port 5001) for horizontal scaling demonstrations.
    4. Verified full frontend Vite build and confirmed 66 passing server tests.

---

## 📚 Simple Breakdown: The 4 Modules of ProxiSpeak (In Plain English)

### 1. The Signaling Server (Abhay - Backend Lead)
- **What it does:** It acts as the matchmaker. WebRTC audio cannot connect directly without a server introducing the two browsers first.
- **How it works:** When Alice moves near Bob, the server checks if their distance is $\le 100$px. If yes, it tells Alice: *"You have the smaller socket ID, so you send the audio offer to Bob."* Once they connect, audio goes directly between Alice and Bob; the server doesn't carry heavy audio bytes!

### 2. Spatial Calculations & Database (Kajal - Backend & DB)
- **What it does:** Tracks where avatars are and saves them efficiently.
- **How it works:** If we wrote to MongoDB 60 times a second every time a player moves, the database would crash. We **debounce** writes (wait 1 second of pause before saving). Live proximity is checked **in Node.js RAM** using Pythagorean math in less than 0.02 milliseconds!

### 3. The 2D Virtual Office Canvas (Tanvi - Frontend World)
- **What it does:** Draws the game screen you see in the browser.
- **How it works:** Uses HTML5 `<canvas>` running a 60 FPS game loop. It draws walls, desks, and your avatar. When remote players move, it uses **lerping** (linear interpolation) so they slide smoothly instead of teleporting.

### 4. WebRTC Audio & Distance Volume (Abhishek - Frontend Audio)
- **What it does:** Captures your microphone and changes volume based on distance.
- **How it works:** As Bob walks away from Alice, Alice's browser reduces Bob's volume (`GainNode`). At 0px it is 100% volume; at 100px it becomes 0% (silence). If Bob is on Alice's right, audio plays in the right ear (`StereoPannerNode`).

---

## 🎯 Mid-Review Comprehensive Viva Q&A (Easy & Clear)

### 1. What is ProxiSpeak and what problem does it solve?
- **Answer:** Traditional tools like Zoom or Google Meet force everyone into one rigid call where only one person can speak at a time. ProxiSpeak is a 2D virtual office where voice chat is based on distance: you only hear colleagues within earshot (100 pixels), replicating spontaneous, real-life office conversations.

### 2. Why is live movement handled in RAM instead of reading from MongoDB?
- **Answer:** 50 users moving generate up to 1,500 position updates per second. Sending 1,500 queries every second to MongoDB would cause disk I/O bottlenecks and 20–50ms latency. Keeping coordinates in a JavaScript V8 `Map` in RAM allows sub-millisecond lookups (< 0.02 ms), maintaining a smooth 60 FPS user experience.

### 3. What is Debouncing and why is it used?
- **Answer:** Debouncing delays an action until after a quiet period. While a player is continuously walking, we broadcast their position live via WebSockets, but we delay saving to MongoDB until they stop walking for 1 full second (`1000ms`). This reduces database writes by over 95%.

### 4. What is "WebRTC Glare" and how did you prevent it?
- **Answer:** Glare happens when two peers walk into earshot at the exact same millisecond and both try to create and send an SDP Offer to each other at the same time, causing their connection to freeze. We solved this with the **Lower Socket ID rule**: the server compares socket IDs alphabetically and only tells the smaller ID (`socketA.id < socketB.id`) to initiate the offer.

### 5. Why does the server check the 100px boundary before forwarding WebRTC packets?
- **Answer:** For privacy and security. If the server blindly forwarded audio connection requests without checking distance, a hacked browser client could connect to anyone's microphone on the map. The server validates that Euclidean distance is $\le 100$px before forwarding any audio signaling messages.

### 6. How does ghost player resurrection on disconnect get prevented?
- **Answer:** If a user closes their tab while a debounced database write is pending, a late write could save them back to MongoDB after they left. We prevent this by cancelling the timer on disconnect, awaiting in-flight write promises, placing the socket ID in a tombstone set, and then deleting the document.

### 7. How does distance attenuation (volume drop-off) work?
- **Answer:** We feed the incoming WebRTC audio track into a Web Audio API `GainNode`. The gain formula is `Math.max(0, 1 - distance / 100)`. When players are on top of each other (0px), gain is 1.0 (100% volume). As they walk away, volume decreases linearly until it reaches 0.0 (silent) at 100px.

### 8. What is stereo panning?
- **Answer:** We use a `StereoPannerNode` where `pan = (peerX - myX) / 100`, clamped between `-1.0` (pure left) and `+1.0` (pure right). If a coworker is standing to your right on the map, their voice comes through your right headphone.

### 9. Why use MongoDB `2d` index instead of `2dsphere`?
- **Answer:** Our canvas is a flat 2D pixel grid ($1000 \times 600$), not a round globe. `2dsphere` calculates curved spherical distances on Earth using longitude/latitude in meters. `2d` calculates flat planar Euclidean distance in pixels, which is faster and mathematically accurate for our canvas.

### 10. What is Multi-Instance scaling and how does Redis help?
- **Answer:** A single Node.js server cannot handle thousands of connections. In multi-instance mode, we run multiple server processes (e.g., port 5000 and port 5001). We use Redis Pub/Sub and the Socket.IO Redis adapter so that when Player A on Server 1 moves, Server 2 is notified via Redis, allowing players connected to different servers to see and hear each other.

### 11. What is the difference between `start.bat` and `start-multi.bat`?
- **Answer:**
  - `start.bat` is the standard one-click development launcher that verifies Node.js, installs dependencies if needed, and starts 1 server (port 5000) and 1 frontend client.
  - `start-multi.bat` launches 2 separate Node instances (port 5000 and 5001) alongside the client to demonstrate multi-server clustering and Redis fallback.

---

## 🏁 Done Checklist
- [x] Week 1 merged to main (Signaling, Movement, Canvas, 2D Index, tagged `v0.1`)
- [x] Week 2 completed across all modules (Proximity, WebRTC, Glare Prevention, Attenuation, tagged `v0.2-mid`)
- [x] 66/66 automated tests passing with zero regressions
- [x] One-click `.bat` executable launchers created (`start.bat` & `start-multi.bat`)
- [x] Multi-instance scaling verification tests implemented (`test-multi-instance.js` & `multiInstance.test.js`)
- [x] Mid-Review Checklist & Sprint Board complete (`docs/mid-review-checklist.md`)
- [x] Comprehensive Viva Q&A and simplified module breakdown documented
