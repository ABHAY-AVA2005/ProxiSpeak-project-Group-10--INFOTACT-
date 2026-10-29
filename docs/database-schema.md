# ProxiSpeak: Database Schema & Geospatial Persistence Notes

**Author:** Kajal Kumari Singh (Backend & Database Lead)
**Branch:** `kajal-backend`
**Milestone:** Week 1, Day 7 (`docs: DB schema notes, fix bugs found`)
**Targets:** <20ms proximity calculation, 50+ concurrent users, 60 FPS real-time rendering.

---

## 1. Architectural Strategy & Storage Model

ProxiSpeak decouples high-frequency real-time multiplayer state from persistent storage:

```
[ Client Avatar Movement (15-60 FPS) ]
                 │
                 ▼ (WebSockets / Socket.io)
[ Node.js Server In-Memory State (Map) ] ───(Instant Broadcast)───► [ All Clients (<20ms) ]
                 │
                 ▼ (1000ms Debounce Timer)
[ MongoDB Atlas (Player Model / 2d Index) ]
```

1. **In-Memory Map (`players` / `userManager.js`):**
   - Single source of truth for active player positions `[x, y]`, socket IDs, and usernames.
   - Operations occur in $\mathcal{O}(1)$ time with sub-millisecond latency.
   - Immediate broadcast of `user:moved` / `player-moved` over WebSockets ensures smooth 60 FPS client interpolation without database bottlenecks.

2. **Persistent Document Store (`MongoDB`):**
   - Retains active session records and prepares for Week 2 proximity grouping and Week 4 room/obstacle layouts.
   - Writes are debounced by 1000 ms to eliminate disk and network I/O saturation during rapid user movement.

---

## 2. Player Document Schema Definition

The `Player` model is defined in `server/src/models/Player.js` (ES Module) and `server/models/Player.js` (CommonJS):

```javascript
import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    playerId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    username: {
      type: String,
      trim: true,
      default: "Anonymous"
    },
    // Discrete Cartesian canvas coordinates
    x: {
      type: Number,
      required: true,
      default: 100
    },
    y: {
      type: Number,
      required: true,
      default: 100
    },
    // 2D geospatial coordinate pair [x, y] in canvas pixels
    position: {
      type: [Number],
      required: true,
      default: [100, 100]
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// 2D Cartesian index on flat canvas coordinates
playerSchema.index({ position: "2d" });

export const Player = mongoose.models.Player || mongoose.model("Player", playerSchema);
```

### Schema Attribute Reference

| Field | BSON / Mongoose Type | Required | Constraints / Defaults | Purpose |
|---|---|---|---|---|
| `playerId` | `String` | Yes | `unique: true`, Indexed | Maps directly to Socket.IO `socket.id`. Unique identifier for player session. |
| `username` | `String` | No | `trim: true`, default `"Anonymous"` | Display name shown above player avatar. Sanitized on join. |
| `x` | `Number` | Yes | Finite Float/Integer, `0 <= x <= 1000` | X-coordinate on the 2D canvas pixel grid. |
| `y` | `Number` | Yes | Finite Float/Integer, `0 <= y <= 600` | Y-coordinate on the 2D canvas pixel grid. |
| `position` | `[Number]` | Yes | `[x, y]` array of 2 numbers | Indexed Cartesian point for planar proximity queries. |
| `lastSeen` | `Date` | No | `default: Date.now` | Heartbeat timestamp recording last interaction or position flush. |
| `createdAt` | `Date` | Auto | Managed by `timestamps: true` | Record creation timestamp. |
| `updatedAt` | `Date` | Auto | Managed by `timestamps: true` | Record last modification timestamp. |

---

## 3. Geospatial Indexing: Planar 2D vs. Spherical 2dsphere

A core technical decision (`05_TECH_DECISIONS.md`) governs the geospatial index type:

### Why `2d` Index?
- **Planar Euclidean Geometry:** ProxiSpeak's virtual office is a flat Cartesian canvas (`1000 x 600` pixels).
- **Direct Pixel Distance:** Distance between points $(x_1, y_1)$ and $(x_2, y_2)$ is given by the standard Euclidean formula:
  $$d = \sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}$$
- When querying `$near` with `$maxDistance: 100`, MongoDB measures exactly 100 canvas pixels directly without coordinate transformation.

### Why NOT `2dsphere` Index?
- `2dsphere` models coordinates on an earth-like WGS84 sphere (longitude and latitude in degrees from -180 to 180 and -90 to 90).
- Spherical calculations evaluate great-circle arc distances in radians or meters. Applying spherical geometry to canvas pixel coordinates distorts distances, breaks boundary validation, and degrades indexing performance.

### Future Proximity Queries (Week 2 & Week 4)

1. **Earshot Proximity ($100\text{px}$ radius):**
   ```javascript
   // Find all players within 100 pixels of avatar position [x, y]
   const nearbyPlayers = await Player.find({
     position: {
       $near: [currentX, currentY],
       $maxDistance: 100
     }
   });
   ```

2. **Room Boundary Filtering ($geoWithin / $box):**
   ```javascript
   // Query all players located within a rectangular room
   const roomPlayers = await Player.find({
     position: {
       $geoWithin: {
         $box: [
           [bottomLeftX, bottomLeftY],
           [topRightX, topRightY]
         ]
       }
     }
   });
   ```

---

## 4. Concurrency, Debouncing, and Lifecycle Guards

Real-time multiplayer applications present severe concurrency challenges when synchronizing state to disk. ProxiSpeak implements four layers of defense:

### 1. Debounced Persistence (`DB_DEBOUNCE_MS = 1000`)
- Avatar movements occur at 15–60 updates per second. Writing every position update directly to MongoDB would saturate connection pools and breach the <20ms latency budget.
- Movement updates are broadcast over WebSockets instantaneously.
- Database writes are scheduled on a 1-second debounce timer (`moveDebounceTimers` Map). Every new movement event clears and resets the user's timer. Only when movement halts for 1 second is `Player.updateOne` called.
- Result: **>95% reduction in database write load**.

### 2. In-Flight Write Tracking (`inFlightWrites` Map)
- Asynchronous database operations (such as `Player.findOneAndUpdate` on join or `Player.updateOne` on move) take 5–50ms over network connections.
- If a client disconnects immediately while a join or move write is in flight, executing `Player.deleteOne` immediately could finish *before* the in-flight write, causing the write to recreate or resurrect the deleted document (a "zombie record").
- `persistPlayerDisconnect` checks `inFlightWrites.has(socketId)` and awaits the active promise before issuing `Player.deleteOne`.

### 3. Tombstone Set (`disconnectedSockets` Set)
- Once a socket initiates disconnection, it is immediately registered in `disconnectedSockets`.
- Any delayed timer callback or pending promise checks `disconnectedSockets.has(socketId)`. If present, the database update aborts immediately, preventing zombie record insertion.
- Entries in `disconnectedSockets` automatically expire and are purged after 5 seconds via an unreferenced timer (`cleanupTimer.unref()`).

### 4. Connection State Buffering (`isDbConnected()`)
- When the Node.js server boots up, `connectDB()` connects to MongoDB asynchronously.
- Mongoose features an internal command buffer that holds operations until the connection handshake succeeds.
- `isDbConnected()` returns `true` if `readyState === 1` (connected) or `readyState === 2` (connecting), enabling Mongoose command buffering and eliminating startup drop bugs.

---

## 5. Index Migration & Verification Strategy

The database migration script (`server/src/scripts/migrate-indexes.js` and `server/scripts/migrate-indexes.js`) ensures consistent index definitions across local development and production Atlas deployments:

1. **DDL Isolation:** The migration script executes only index DDL operations (`collection.createIndex` and `collection.dropIndex`). It does not modify or delete player documents.
2. **Obsolete Index Pruning:** Scans for and drops any legacy `{ location: "2dsphere" }` index.
3. **Target Index Creation:** Creates `{ position: "2d" }` with index name `position_2d`.
4. **Post-Migration Verification:** Refreshes and inspects active indexes from MongoDB:
   - Asserts `{ position: "2d" }` exists.
   - Asserts obsolete `{ location: "2dsphere" }` does not exist.
   - Exits with code `1` if verification fails.

Execution command:
```bash
npm run migrate:indexes
```

---

## 6. Viva Voce Q&A Cheat Sheet

**Q1: Why did you choose a `2d` index instead of `2dsphere`?**
> "Our game world is a 2-dimensional flat canvas rendered in pixels (1000x600). A `2dsphere` index computes spherical distances on an Earth ellipsoid using latitude and longitude in degrees. A `2d` index computes planar Euclidean distances directly in pixel units ($d = \sqrt{\Delta x^2 + \Delta y^2}$), which perfectly matches our canvas coordinates and allows `$near` with `$maxDistance: 100` to mean exactly 100 pixels."

**Q2: Why not write to MongoDB on every movement packet?**
> "Players send 15 to 60 movement packets per second. Writing every move to MongoDB would generate hundreds of disk and network writes per second, crashing the database and violating our strict <20ms proximity budget. Instead, we maintain active positions in an in-memory Map for sub-millisecond lookups and instant WebSocket broadcast, and debounce MongoDB writes by 1 second. This reduces database I/O by over 95% while keeping movement at 60 FPS."

**Q3: How do you prevent race conditions and 'zombie' player records when a user abruptly disconnects?**
> "When a client disconnects, we cancel any pending debounce timer, register the socket in a `disconnectedSockets` tombstone set, and check `inFlightWrites`. If an upsert or write is currently traveling across the wire, `persistPlayerDisconnect` awaits that promise before executing `Player.deleteOne`. This guarantees that the delete always runs last and prevents asynchronous writes from resurrecting departed players."

**Q4: Does modifying the Mongoose schema remove obsolete indexes from MongoDB?**
> "No. Mongoose schema definitions only tell Mongoose what indexes to ensure or build; Mongoose never drops existing indexes on the database. If an old index like `location: 2dsphere` exists in MongoDB, it remains active until explicitly dropped via a migration script or database command (`collection.dropIndex()`). That is why we wrote `scripts/migrate-indexes.js` to inspect and migrate the indexes safely."
