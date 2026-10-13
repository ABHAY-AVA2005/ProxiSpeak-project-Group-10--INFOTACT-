# 02 - Team Plan (Day-wise, ProxiSpeak)

**Team:** Abhay Varshit Aripirala (Team Lead), Tanvi Dighe, Kajal Kumari Singh, Abhishek Bhalla
**Plan window:** Sat 10 Oct 2026 to Tue 10 Nov 2026 (32 days)
**Mid review window:** 27 to 30 Oct 2026. **Final review:** dates not announced (brief says 5th to 10th; plan is feature-ready by 5 Nov and uses 6 to 10 Nov for docs, rehearsal and buffer).

## Working assumptions
- All members use AI IDEs ("vibe coding"). Rule: understand every line before committing it, because the Viva tests individual understanding.
- Database work is part of the backend and is owned by Kajal.
- Every member commits every day in their OWN branch (see Branches below), including weekends.

## Roles
| Member | Side | Owns |
|---|---|---|
| Abhay (Lead) | Backend | Socket.io signaling server, WebRTC relay, Redis adapter, merging, repo and dashboard, work distribution |
| Kajal | Backend and Database | MongoDB schemas and geospatial queries, clustering, benchmarks, load tests, room persistence |
| Tanvi | Frontend | React and Canvas world, avatars, movement, obstacles, 60 FPS |
| Abhishek | Frontend (Audio) | getUserMedia, RTCPeerConnection, Web Audio gain and stereo panning |

Pairs: Tanvi+Abhay (movement events), Abhishek+Abhay (WebRTC signaling), Tanvi+Kajal (nearby users and rooms), Abhishek+Kajal (distance and volume).

## Branches (already created on GitHub)
| Member | Branch |
|---|---|
| Abhay | `abhay-team-lead` |
| Tanvi | `tanvi-frontend` |
| Abhishek | `abhishek-audio` |
| Kajal | `kajal-backend` |

Repo: `ABHAY-AVA2005/ProxiSpeak-project-Group-10--INFOTACT-`. Branch names match roles: Abhishek works on audio (frontend), Kajal on backend/database.

## Official week plan (from the company)
| Week | Backend (Node.js, Express, Socket.io, MongoDB) | Frontend (React, WebRTC, Canvas API) |
|---|---|---|
| Week 1 | Signaling and Movement: WebSocket server broadcasts avatar X/Y. Basic MongoDB geospatial schemas. | World Rendering: React Canvas layer. Smooth keyboard/mouse avatar movement and coordinate broadcasting. |
| Week 2 | Proximity Calculations: MongoDB $near queries to group users. Only send WebRTC offer/answers to users within a 100-pixel radius. | WebRTC Integration: standard WebRTC peer-to-peer audio using getUserMedia. |
| Mid-Project Review | Spatial Audit: prove backend filters and clusters users under 20ms. | Audio Check: two browsers establish a WebRTC audio connection via the signaling server. |
| Week 3 | Mesh Scaling: optimize WebRTC mesh. Redis Pub/Sub to scale Socket.io across multiple Node instances. | Dynamic Attenuation: hook WebRTC tracks into Web Audio API. Volume drop-off algorithm by pixel distance. |
| Week 4 | Room Persistence: save office layouts and furniture obstacles (which block sound) into MongoDB. | Refine and Polish: 3D audio panning (stereo). Canvas at steady 60 FPS. |
| Final Project Review | A highly scalable, stateful geospatial server managing complex P2P routing logic. | An immersive, physics-aware communication platform with advanced browser audio manipulation. |

## Day-wise plan
Each cell is that person's suggested commit for the day (format `type: short meaning`). Make at least one real commit in your own branch each day.

### Week 1 (10 to 16 Oct): Signaling, Movement, World Rendering

| Day | Abhay (BE) | Tanvi (FE) | Abhishek (FE/Audio) | Kajal (BE/DB) |
|---|---|---|---|---|
| 1 Sat 10 Oct | chore: create repo, folders client/server, .gitignore, verify 4 member branches, connect dashboard | chore: scaffold React (Vite) app in client | chore: add .env.example and docs: WebRTC research notes | chore: Express server scaffold and MongoDB Atlas connection |
| 2 Sun 11 Oct | feat: Socket.io server with connect and disconnect logs | feat: Canvas component draws office floor grid | feat: useSocket hook and join screen with username | feat: User schema with 2d index on position [x, y] |
| 3 Mon 12 Oct | feat: join event, in-memory users, broadcast users:list | feat: draw avatar (circle and name) at x/y | feat: keyboard movement state (WASD and arrows) | feat: upsert user on join, remove on disconnect |
| 4 Tue 13 Oct | feat: move event broadcasts x/y to everyone | feat: requestAnimationFrame loop for smooth movement | feat: throttled move emit (about 15 per second) | feat: debounced position save to MongoDB, verify index |
| 5 Wed 14 Oct | fix: server-side coordinate bounds validation | feat: render remote avatars with interpolation | feat: mouse click-to-move | test: script spawning fake socket clients |
| 6 Thu 15 Oct | chore: review and merge Week 1 branches into main | feat: world bounds and wall rectangles | fix: movement edge cases and listener cleanup | docs: socket events list and DB schema in README |
| 7 Fri 16 Oct | docs: Week 1 write-up draft, tag v0.1 | docs: movement screenshots or GIF, refactor canvas code | test: two-browser movement test log | docs: DB schema notes, fix bugs found |


### Week 2 (17 to 23 Oct): Proximity and WebRTC Audio

| Day | Abhay (BE) | Tanvi (FE) | Abhishek (FE/Audio) | Kajal (BE/DB) |
|---|---|---|---|---|
| 8 Sat 17 Oct | feat: signaling event names and relay skeleton (offer, answer, ice) | feat: draw 100px earshot circle around own avatar | feat: getUserMedia mic permission and mute button | feat: getNearbyUsers() using $near, 100px |
| 9 Sun 18 Oct | feat: relay offer, answer, ICE to a target socket | feat: highlight nearby users in color | feat: PeerConnection helper (create, close) | feat: cluster users into groups (connected components) |
| 10 Mon 19 Oct | feat: relay only if both users are within 100px | feat: panel listing users in earshot | feat: create offer and attach local mic track | feat: emit nearby:enter and nearby:leave diffs |
| 11 Tue 20 Oct | feat: lower-id-sends-offer rule on nearby:enter | feat: speaking indicator ring | feat: handle answer and ICE, play remote audio (ontrack) | perf: query timing logger |
| 12 Wed 21 Oct | fix: close peers on disconnect | fix: sync UI with connected peers | feat: close peer on nearby:leave, reconnect logic | perf: cache and index tuning to get under 20 ms |
| 13 Thu 22 Oct | test: 2-browser audio connection run, fixes | test: 4-tab UI run, polish | test: audio check demo script | test: spatial audit script, results to docs/benchmarks.md |
| 14 Fri 23 Oct | chore: merge Week 2 branches, tag v0.2-mid | fix: bugs from merge | fix: audio bugs from merge | docs: benchmark results table |


### Mid review preparation (24 to 26 Oct): documentation and checking, no hurry coding

| Day | Abhay | Tanvi | Abhishek | Kajal |
|---|---|---|---|---|
| 15 Sat 24 Oct (bug fixes only, feature freeze) | fix: only bugs from full demo rehearsal | fix: UI bugs | fix: audio bugs | fix: performance bugs |
| 16 Sun 25 Oct (docs only) | docs: main README (overview, install, run) | docs: frontend module guide and screenshots | docs: WebRTC sequence diagram and flow | docs: geospatial and backend guide, benchmark table |
| 17 Mon 26 Oct (docs and observe) | docs: final Week 1 and 2 write-up; test install from a fresh clone | docs: frontend viva Q&A notes; observer run-through, no new code | docs: WebRTC and audio viva notes; test on a second laptop | docs: geospatial viva notes; check GitHub shows commits every day |


### Week 3 (27 Oct to 1 Nov): Scaling and Dynamic Attenuation (overlaps mid review 27 to 30 Oct)

| Day | Abhay (BE) | Tanvi (FE) | Abhishek (FE/Audio) | Kajal (BE/DB) |
|---|---|---|---|---|
| 18 Tue 27 Oct | docs: mid review checklist; chore: Week 3 board | chore: distance helper functions | feat: AudioContext and GainNode per peer | chore: Redis setup (Docker) and config |
| 19 Wed 28 Oct | feat: Socket.io Redis adapter | feat: volume ring visual from distance | feat: route remote stream to Gain to destination | feat: Redis pub/sub for shared positions |
| 20 Thu 29 Oct | feat: run 2 Node instances, test cross-instance messages | feat: debug overlay (distance and volume per peer) | feat: volume drop-off by pixel distance (inverse or linear) | feat: nearby logic works across instances |
| 21 Fri 30 Oct | docs: multi-instance run guide | feat: smooth gain ramps in UI | feat: crossfade when entering and leaving the 100px range | perf: nearest-N peer cap logic (6 to 8) |
| 22 Sat 31 Oct | feat: enforce mesh cap in signaling | feat: indicator for capped peers | fix: audio glitches and clicks | test: load test with 50 simulated clients |
| 23 Sun 1 Nov | chore: merge Week 3 branches, tag v0.3 | perf: FPS check and fixes | test: attenuation manual test notes | docs: scaling and Redis notes |


### Week 4 (2 to 5 Nov): Persistence, Panning, Polish, Deployment

| Day | Abhay (BE) | Tanvi (FE) | Abhishek (FE/Audio) | Kajal (BE/DB) |
|---|---|---|---|---|
| 24 Mon 2 Nov | feat: room REST API (GET and POST /api/rooms) | feat: place and remove furniture obstacles on canvas | feat: StereoPanner based on relative x | feat: Room schema with obstacles, $geoWithin query |
| 25 Tue 3 Nov | feat: send saved room to clients on join | feat: render obstacles loaded from API | feat: obstacle blocks sound (reduce gain on line intersection) | feat: server-side obstacle check |
| 26 Wed 4 Nov | feat: persist layout save, integration test | perf: steady 60 FPS (static layer cache) | feat: tune panning and attenuation | test: end-to-end load and latency test |
| 27 Thu 5 Nov | chore: merge, tag v1.0-rc, deploy backend | chore: deploy frontend (HTTPS) | fix: mic works on deployed HTTPS site | chore: production Atlas and Redis config |


### Final review preparation (6 to 10 Nov): documentation, observation, rehearsal

| Day | Abhay | Tanvi | Abhishek | Kajal |
|---|---|---|---|---|
| 28 Fri 6 Nov (docs only) | docs: final README and architecture | docs: frontend docs and screenshots | docs: audio pipeline docs (gain, pan, attenuation) | docs: backend, database, Redis and benchmark docs |
| 29 Sat 7 Nov (docs and observe) | docs: project report draft | docs: PPT slides (world and UI part) | docs: PPT slides (audio part); observer test on 2 devices | docs: PPT slides (backend part); viva Q&A for geospatial |
| 30 Sun 8 Nov | docs: final report, demo script | docs: final screenshots; fix tiny UI issues | docs: viva notes; record social media video | docs: final report data section; record video |
| 31 Mon 9 Nov | fix: only bugs from rehearsal, tag v1.0 | fix: bugs from rehearsal | test: final demo run with 4 users | test: final load test notes |
| 32 Tue 10 Nov | docs: final merge and submission check | docs: update README for submission | docs: update screenshots and notes | docs: final cleanup, verify dashboard sync |

Notes: 24 Oct is bug fixes only (feature freeze). 25 and 26 Oct are documentation and observation only (no new features, no rushed code). On 26 Oct and 8 Nov each member records and posts their social media video. During 27 to 30 Oct `main` stays on tag v0.2-mid; new work stays in member branches until the review slot is done. Same rule for 6 and 7 Nov (docs and observation, no hurried code).

## Daily routine
1. Morning: post one line in the group on what you will do today.
2. Work in your own branch; commit small and often.
3. Before 9 PM: `git push origin your-branch-name`, then post what you finished and any blockers.
4. Abhay checks the GitHub contribution graph nightly and reminds anyone without a commit.
5. If a member is unresponsive for 48 hours, report them and continue.

## Priority if time runs short
Movement, then proximity, then WebRTC audio, then attenuation, then Redis, then panning and obstacles.
