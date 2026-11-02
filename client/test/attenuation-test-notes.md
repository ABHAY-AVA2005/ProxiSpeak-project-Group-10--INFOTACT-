# Proximity Audio Attenuation Manual Test Notes

**Module:** Web Audio API Gain Falloff & Anti-Click Ramping  

## Test Environment
- **Browser 1:** Google Chrome v128 (Client A)
- **Browser 2:** Microsoft Edge v128 (Client B)
- **Audio Output:** Stereo headphones (monitoring left/right panning)

## Measured Attenuation vs Distance

| Avatar Distance (px) | Expected Gain | Measured Gain Node Value | Audio Perception |
|---|---|---|---|
| **0 px (Overlapping)** | 1.00 | 1.00 | Full volume, center stereo |
| **25 px** | 0.85 | 0.85 | Clear, loud, slight panning |
| **50 px (Half-way)** | 0.50 | 0.50 | Moderate conversation volume |
| **75 px** | 0.15 | 0.15 | Soft background level |
| **100 px (Boundary)** | 0.00 | 0.00 | Completely silent; connection tears down cleanly |
| **> 100 px** | 0.00 | 0.00 | Silent, zero network packets emitted |

## Observations
- Anti-click parameter smoothing (`setTargetAtTime(..., 0.03)`) removed audible crackles during continuous WASD diagonal movement.
- Cosine crossfading curve prevented abrupt volume cuts when crossing the 100px boundary.