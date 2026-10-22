# Setup
1. Two browser windows (Tab A on `localhost:5173`, Tab B on `localhost:5173` in Incognito).
2. Users "Abhishek" and "PeerUser" joined into the office space.

## Test Procedure & Results

| # | Step | Action | Expected Output | Status |
|---|---|---|---|---|
| 1 | Mic Permission | Click "Enable Microphone" | Browser prompt allows audio capture | PASS |
| 2 | Distant Avatars | Keep avatars > 100px apart | No WebRTC connection initiated | PASS |
| 3 | Proximity Entry | Move within 100px earshot | `webrtc:offer` & `answer` handshake fires | PASS |
| 4 | Peer Audio Stream | Speak into microphone A | Audio plays clearly through Tab B | PASS |
| 5 | Mute Button | Click "Mic Active" -> "Mic Muted" | Mic track disabled, sound silences | PASS |
| 6 | Exit Radius | Move > 100px away | `nearby:leave` event closes PeerConnection | PASS |