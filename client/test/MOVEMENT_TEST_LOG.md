## Test Environment
- Browser A: Google Chrome (Client 1: "UserA")
- Browser B:Mozilla Firefox (Client 2: "UserB")
- Server: Node.js + Express + Socket.io running on `http://localhost:5000`

## Test Matrix & Results

| Test Case | Procedure | Expected Result | Status |
| :--- | :--- | :--- | :--- |
| TC-01: Connect & Join | Enter usernames in both browsers and join | Both clients see each other on Canvas with names | PASS |

| TC-02: WASD & Arrow Keys | Move UserA using WASD; observe UserB | UserB sees UserA position update in real time | PASS |

| TC-03: Throttling Check| Move continuously for 5 seconds | Network tab shows ~15 `move` emits/sec (~66ms interval) | PASS |

| TC-04: Mouse Click-to-Move| Click at destination coordinate on Canvas | Avatar smoothly moves to target point | PASS |

| TC-05: Tab Switch / Blur| Hold 'W' and press Alt+Tab / switch window | Avatar stops immediately; key does not stick | PASS |

| TC-06: Bounds Clamping| Walk avatar to (0, 0) and (2000, 2000) edges | Avatar stops at boundary without going offscreen | PASS |

## Performance Observations
- Render FPS: Steady 60 FPS on HTML5 Canvas.
- WebSocket Latency: < 15ms broadcast delay over localhost.