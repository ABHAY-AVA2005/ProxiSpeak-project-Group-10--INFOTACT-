# WebRTC & Audio Module Notes

## Overview
ProxiSpeak connects users via spatial peer-to-peer audio.
We use a mesh WebRTC connection between avatars who are within earshot (100px radius), managed by the Socket.io signaling server.

## Audio Graph Flow
Microphone -> getUserMedia() -> Local Track -> RTCPeerConnection -> Remote Peer
On remote peer:
Remote Track -> AudioContext -> GainNode (distance attenuation) -> StereoPannerNode (left/right) -> Speakers

## Signaling Steps
1. Detection: backend/client detects another avatar within 100px.
2. Glare prevention: peer with lower socket ID initiates the call (creates offer).
3. Offer/Answer:
   - Caller creates offer -> sends via socket `signal:offer`
   - Receiver sets remote desc -> creates answer -> sends via socket `signal:answer`
4. ICE exchange: candidates forwarded as they arrive via `signal:ice`.
5. Disconnect: when distance > 100px, close RTCPeerConnection and release audio node.

## Formulas
- Distance: d = sqrt((x2 - x1)^2 + (y2 - y1)^2)
- Max earshot radius: 100px
- Volume Gain: 1 - (distance / 100)  [linear falloff, clamped between 0 and 1]
- Pan: clamp((x2 - x1) / 100, -1, 1) [-1 is left ear, 1 is right ear]

## Browser notes
- Needs HTTPS or localhost for mic permissions.
- Chrome/Safari require a user gesture (button click) before AudioContext can start playing sound.