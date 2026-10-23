# 06 - Progress Log (Abhay, abhay-team-lead)

> Update this every night before pushing. The AI reads it at the start of each session.

## Current status
- Current day: Day 14 (Fri 23 Oct 2026)
- Current task (from 02_TEAM_PLAN.md): chore: merge Week 2 branches, tag v0.2-mid
- Blockers: none
- Week 2 status: ✅ COMPLETE — all Week 2 milestones merged into main, tagged v0.2-mid

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

## 📋 Viva Notes & Technical Concepts (Team Lead & Backend)

### 1. Key Modules & Implementations
- **`server/src/server.js`**: Starts the HTTP server and attaches WebSockets for real-time bidirectional communication. Applies CORS and 10kb JSON body limits to guard against DoS.
- **`server/src/sockets/socketHandler.js`**: WebRTC signaling relay (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`), 100px proximity verification guardrails, lower socket ID glare prevention rule, and comprehensive disconnect teardown.
- **`server/src/services/userManager.js`**: In-memory RAM Map for sub-millisecond coordinate reads/writes for 60 FPS movement without database bottlenecks, coordinate clamping (0 to 2000px), and username sanitization against XSS.

### 2. Viva Q&A
1. **Why keep live positions in memory instead of reading from MongoDB?**
   - *Viva Answer:* With 50 players moving, the server receives up to 1,500 position updates per second. Sending 1,500 queries/sec to a database creates disk and network latency. An in-memory `Map` provides microsecond lookups for smooth 60 FPS gameplay, while MongoDB is updated in the background.
2. **What is WebRTC Glare and how was it solved?**
   - *Viva Answer:* If Player A and Player B walk into earshot at the exact same moment, both might send an SDP Offer simultaneously, causing a connection collision. We solved this with the **Lower Socket ID rule**: the server compares socket IDs lexicographically (`socketA.id < socketB.id`) and designates only the smaller ID to initiate the offer.
3. **Why enforce a 100px proximity check on WebRTC signaling in the server?**
   - *Viva Answer:* Security and privacy. If the server blindly relayed WebRTC offers, a rogue client could send an offer to any player across the map. The server enforces Euclidean distance ($\le 100$px) before relaying offers, answers, or ICE candidates.
4. **How is ghost player resurrection prevented on disconnect?**
   - *Viva Answer:* When a player disconnects, the server cancels pending debounce timers, awaits in-flight database save promises, marks the socket ID in a `disconnectedSockets` set to block delayed saves, and removes the document from MongoDB and RAM.

---

## 🏁 Milestone Done Checklist
- [x] Week 1 merged to main (Scaffolding, Movement, Canvas, 2D Index)
- [x] Week 2 completed across all 4 branches (Proximity, WebRTC, Glare Prevention, Attenuation)
- [x] Week 2 merged to `main`, tagged `v0.2-mid` ✅ (23 Oct 2026)
- [x] Full test suite verified (37/37 automated tests passing)
- [ ] Mid review ready (demo video, report, benchmark charts)
- [ ] Week 3 merged, tagged `v0.3`
- [ ] Week 4 merged, deployed, tagged `v1.0`
