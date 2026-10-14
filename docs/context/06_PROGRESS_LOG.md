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
- Tomorrow (Day 4): feat: move event broadcasts x/y to everyone

<!-- Copy the block above for each new day. -->

## Viva notes (add as you go)
- What each file does in simple words:
  - `server/src/server.js`: Starts Express HTTP and Socket.io server, applies CORS and parses JSON.
  - `server/src/sockets/socketHandler.js`: Central Socket.io hub that listens to connection, join, and disconnect events.
  - `server/src/services/userManager.js`: Fast in-memory Map storing connected active users (socketId, username, position [x, y]).
- Key decisions and why (2d index, throttling, mesh cap, lower-id offer rule):
  - In-memory Map used for live connected users to avoid querying MongoDB on every movement event or lookup.
- Questions I should be ready for:
  - Why keep live coordinates in memory instead of reading from DB? Database roundtrips add 5-20ms latency and high I/O overhead; in-memory lookup is sub-millisecond.

## Done checklist
- [ ] Week 1 merged to main
- [ ] Week 2 merged, tag v0.2-mid
- [ ] Mid review ready (docs, benchmarks, video)
- [ ] Week 3 merged, tag v0.3
- [ ] Week 4 merged, deployed, tag v1.0
- [ ] Final review ready (report, PPT, video)
