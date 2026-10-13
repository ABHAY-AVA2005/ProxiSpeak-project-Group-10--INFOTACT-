# 05 - Technical Decisions and Guardrails

## Architecture overview
- **Client (React + Canvas):** draws the office map and avatars, captures keyboard/mouse movement, emits throttled position updates, holds WebRTC peer connections and the Web Audio graph.
- **Server (Node + Express + Socket.io):** receives movement, keeps live positions in memory, decides who is within earshot, and relays WebRTC signaling (offer, answer, ICE) only between users within 100 px.
- **MongoDB:** stores users' positions (geospatial index) and later saved rooms and obstacles.
- **Redis (Week 3):** Pub/Sub plus the Socket.io Redis adapter so multiple Node instances share events.
- **Audio:** WebRTC peer-to-peer audio, routed through Web Audio (GainNode for volume, StereoPanner for left/right).

## Decisions

### 1. Geospatial index: use `2d` with [x, y] pairs
The map is a flat pixel grid, so use a legacy `2d` index on `position: [x, y]`, not `2dsphere` (which is for latitude/longitude on Earth). Then `$near` with `$maxDistance: 100` means 100 pixels directly.
```js
UserSchema.index({ position: "2d" });
User.find({ position: { $near: [x, y], $maxDistance: 100 } });
```
`$geoWithin` (for example `$box`) is used for rectangular room and obstacle queries in Week 4.

### 2. Throttle movement and avoid DB write on every move
- Client emits position about 15 times per second, not on every key press.
- Server keeps live positions in memory and saves to MongoDB debounced or batched.
- This protects the **20 ms** target and 50+ user scale.
- Server also validates coordinates (inside map bounds) to avoid bad data.

### 3. WebRTC offer rule: lower socket id sends the offer
When two users enter earshot, only the one with the lower socket id creates the offer. This avoids "glare" (both sides offering at once).
Signaling events: `webrtc:offer`, `webrtc:answer`, `webrtc:ice`, relayed only to a target socket, and only if both users are within 100 px.
Proximity events: `nearby:enter`, `nearby:leave` (send diffs, not full lists).

### 4. Mesh cap
A full peer-to-peer mesh of 50 users cannot work (each peer would hold 49 connections). Each user connects to at most **6 to 8 nearest peers**. Others are muted or not connected. State this honestly in the viva.

### 5. Closing peers
Close the RTCPeerConnection on `nearby:leave`, on disconnect, and on tab close. Clean up listeners and audio nodes to avoid leaks.

### 6. Volume drop-off (Week 3)
Compute distance in pixels between avatars. Example inverse-linear model: `gain = clamp(1 - distance / 100, 0, 1)`. Use `gain.setTargetAtTime(...)` for smooth ramps (no clicks). Crossfade when entering or leaving the 100 px range.
Audio graph per peer: `MediaStreamSource -> GainNode -> StereoPanner -> destination`.

### 7. Stereo panning (Week 4)
Pan value in [-1, 1] from relative x position: `pan = clamp((peerX - myX) / 100, -1, 1)`.

### 8. Obstacles block sound (Week 4)
Save furniture as rectangles in MongoDB. If the line between two avatars intersects an obstacle, reduce gain (for example multiply by 0.3). Check server-side and client-side consistently.

### 9. Redis scaling (Week 3)
Use `@socket.io/redis-adapter` and Redis Pub/Sub so events cross Node instances. Test with two Node instances on different ports. Document sticky-session needs.

### 10. Canvas performance (60 FPS)
Use `requestAnimationFrame`, a cached static layer (offscreen canvas) for the map and furniture, and redraw only avatars each frame. Interpolate remote avatar positions for smoothness.

### 11. Deployment and HTTPS
Microphone (`getUserMedia`) needs HTTPS (localhost is fine). Deploy frontend and backend on HTTPS (for example Vercel/Netlify for frontend, Render/Railway for backend, MongoDB Atlas, a hosted Redis). Keep secrets in environment variables.

## Suggested folder structure
```
proxispeak/
  client/            React app (src/components, src/hooks, src/audio, src/world)
  server/            Express + Socket.io (src/sockets, src/models, src/routes, src/services)
  docs/context/      these context files
  docs/benchmarks.md spatial audit results
  README.md
```

## Socket event list (starting point; keep updated in README)
`join`, `users:list`, `move`, `user:left`, `nearby:enter`, `nearby:leave`, `webrtc:offer`, `webrtc:answer`, `webrtc:ice`, `room:load`, `room:save`.

## Benchmarks to record (docs/benchmarks.md)
- Proximity query and clustering time (target under 20 ms) at 10, 25, 50 users
- Concurrent users tested (target 50+)
- Canvas FPS (target steady 60)
- Cross-instance message test with Redis (2 Node instances)

## Rules for the AI assistant
- Do not use `2dsphere` for this project.
- Never write to MongoDB on every move event.
- Keep code simple and commented; the developer must explain it in a viva.
- Never hardcode secrets; use `.env`.
- Stay within the current day's task in `02_TEAM_PLAN.md`.
