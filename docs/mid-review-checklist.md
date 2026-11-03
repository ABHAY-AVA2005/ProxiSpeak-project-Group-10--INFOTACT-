# ProxiSpeak Mid-Project Review Checklist & Week 3 Sprint Board

**Author:** Abhay Varshit Aripirala (Team Lead, Backend)  
**Branch:** `abhay-team-lead`  
**Date:** Tuesday, 27 October 2026 (Day 18)  
**Evaluation Reference:** `docs/context/03_EVALUATION.md` & `docs/context/02_TEAM_PLAN.md`

---

## 📋 Part 1: Mid-Project Review Checklist (27 to 30 Oct 2026)

### 1.1 Team Deliverables Status

| Item | Requirement from Brief / Rubric | Status | Verified By | Notes |
|---|---|:---:|---|---|
| **Spatial Audit Target** | Prove backend filters & clusters users under 20ms | ✅ Passed | Kajal / Abhay | Measured 0.0099ms (p95) for proximity query, 0.0687ms for clustering (`docs/benchmarks.md`). Target `< 20ms`. |
| **P2P Audio Connection** | Two browsers establish WebRTC audio connection | ✅ Passed | Abhishek / Abhay | Real-time signaling relay with 100px proximity checks + lower-id glare prevention. |
| **Canvas World & 60 FPS** | 2D office world rendered smoothly on Canvas | ✅ Passed | Tanvi | 2000×2000px virtual office canvas with requestAnimationFrame loop, AABB collision, and visual 100px earshot circle. |
| **Git & Branch Compliance** | Commits on individual branches, daily consistency | ✅ Passed | All members | 4 distinct branches active (`abhay-team-lead`, `tanvi-frontend`, `abhishek-audio`, `kajal-backend`). Tag `v0.2-mid` verified. |
| **Work Distribution Doc** | Document detailing roles, owned files, pair responsibilities | ✅ Passed | Abhay | Documented in `docs/context/02_TEAM_PLAN.md` & `06_PROGRESS_LOG.md`. |
| **Technical Viva Readiness** | All members prepared to explain code and design | ✅ Ready | All members | Comprehensive viva Q&A documented in `06_PROGRESS_LOG.md` covering all 4 modules. |

---

### 1.2 Demonstration Flow for Reviewers

1. **Architecture & Health Overview (1 min):**
   - Access `GET /health` endpoint: displays active user count, uptime, and server health.
   - Show in-memory user manager structure ensuring sub-millisecond dispatch for 60 FPS.

2. **Geospatial & Proximity Verification (2 mins):**
   - Run `npm test` in `server`: show all 63 unit and integration tests passing cleanly.
   - Highlight the benchmark metrics: proximity query at ~0.01ms (2,000× faster than 20ms SLA) and clustering at ~0.07ms.

3. **Live 2-Client Spatial WebRTC Handshake (3 mins):**
   - Open two browser tabs side-by-side with distinct usernames.
   - Move Alice within 100px of Bob: observe visual earshot highlight and `nearby:enter` emission.
   - Verify WebRTC offer/answer negotiation with `shouldInitiateOffer` governed by lower socket ID.
   - Move Alice beyond 100px: observe graceful `nearby:leave` and audio teardown without memory leaks.

---

## 🚀 Part 2: Week 3 Sprint Board (27 Oct to 1 Nov 2026)

### Focus: Multi-Instance Mesh Scaling (Redis) & Dynamic Spatial Audio Attenuation

| Day | Date | Member | Assigned Task | Target Deliverables & Acceptance Criteria |
|---|---|---|---|---|
| **Day 18** | Tue 27 Oct | **Abhay** | `docs: mid review checklist; chore: Week 3 board` | Create checklist, establish sprint goals, initialize Redis adapter configuration. |
| | | Tanvi | `chore: distance helper functions` | Client-side Euclidean distance helpers with squared distance optimization. |
| | | Abhishek | `feat: AudioContext and GainNode per peer` | Attach Web Audio API `AudioContext` and dynamic `GainNode` to each peer track. |
| | | Kajal | `chore: Redis setup (Docker) and config` | Docker Compose setup for Redis instance and connection configuration in server. |
| **Day 19** | Wed 28 Oct | **Abhay** | `feat: Socket.io Redis adapter` | Integrate `@socket.io/redis-adapter` into `server/src/server.js` with graceful in-memory fallback. |
| | | Tanvi | `feat: volume ring visual from distance` | Dynamic opacity/color gradient on proximity ring indicating connection strength. |
| | | Abhishek | `feat: route remote stream to Gain to destination` | Wire `MediaStreamAudioSourceNode` -> `GainNode` -> `AudioContext.destination`. |
| | | Kajal | `feat: Redis pub/sub for shared positions` | Publish and subscribe to user movement events across Redis channels. |
| **Day 20** | Thu 29 Oct | **Abhay** | `feat: run 2 Node instances, test cross-instance messages` | Cluster/multi-port execution script (`server-1` on 5000, `server-2` on 5001) verifying seamless signaling. |
| | | Tanvi | `feat: debug overlay (distance and volume per peer)` | On-screen HUD showing peer coordinates, distance in pixels, and computed gain level. |
| | | Abhishek | `feat: volume drop-off by pixel distance` | Inverse linear volume attenuation formula: `gain = Math.max(0, 1 - d / 100)`. |
| | | Kajal | `feat: nearby logic works across instances` | In-memory spatial diffs synchronized across multiple Node server processes. |
| **Day 21** | Fri 30 Oct | **Abhay** | `docs: multi-instance run guide` | Comprehensive documentation on running Redis cluster and multi-instance Node servers. |
| | | Tanvi | `feat: smooth gain ramps in UI` | Smooth audio gain transitions (`linearRampToValueAtTime`) to eliminate pops/clicks. |
| | | Abhishek | `feat: crossfade when entering and leaving 100px` | Seamless fade-in on enter and fade-out on leave. |
| | | Kajal | `perf: nearest-N peer cap logic (6 to 8)` | Enforce maximum peer connections per client to preserve WebRTC mesh stability. |
| **Day 22** | Sat 31 Oct | **Abhay** | `feat: enforce mesh cap in signaling` | Server-side gate rejecting WebRTC offer relay when client peer count exceeds cap. |
| | | Tanvi | `feat: indicator for capped peers` | UI badge showing "Peer limit reached" when crowded (>8 avatars). |
| | | Abhishek | `fix: audio glitches and clicks` | Web Audio parameter smoothing and audio buffer tuning. |
| | | Kajal | `test: load test with 50 simulated clients` | Multi-client headless simulation testing CPU and memory under heavy mesh load. |
| **Day 23** | Sun 1 Nov | **Abhay** | `chore: merge Week 3 branches, tag v0.3` | Code review, merge member branches to `main`, tag release `v0.3`. |
| | | Tanvi | `perf: FPS check and fixes` | Profiling 60 FPS performance on 2000×2000px canvas. |
| | | Abhishek | `test: attenuation manual test notes` | Audio quality evaluation matrix across varied headphone and speaker hardware. |
| | | Kajal | `docs: scaling and Redis notes` | Benchmark write-up on multi-instance throughput and Redis memory overhead. |

---

## 🔒 Technical Invariants & Guardrails
1. **Zero Database Blocking on Movement:** Live positions must always reside in memory/Redis pub-sub. MongoDB writes remain strictly debounced.
2. **Strict Earshot Guardrail:** Signaling messages (`webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`) must reject any target $> 100\text{ px}$.
3. **Glare Prevention:** The lower socket ID lexicographical rule must strictly determine offer initiation across all instances.
4. **Graceful Fallback:** If Redis is offline, the server must automatically fall back to single-instance in-memory operation without crashing.
