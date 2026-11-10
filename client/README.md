# ProxiSpeak Client (React + Vite)

Frontend web application for ProxiSpeak — a 2D proximity-aware virtual office.

## Features
- **Modern Virtual Office Canvas**: Realistic top-down office floor plan with labeled rooms (**Meeting Room**, **Focus Zone**, **Open Workspace**, **Lounge**, **Pantry**), glass-like dividers, and walkable doorways.
- **A\* Pathfinding & Click-to-Move**: Click anywhere on the floor to navigate obstacles automatically with path previews and animated destination markers.
- **Directional Animations**: Real-time avatar facing angle and movement feedback.
- **Spatial WebRTC Voice**: Automatic peer connection within customizable proximity distance (50px, 75px, 100px, 150px, 200px) with dynamic volume attenuation.
- **Floating Audio Dock**: Quick-access controls for Microphone, Speaker, Proximity Range, Settings, and End Call.
- **Nearby Voices & Live Presence**: Expandable widget showing teammates within earshot and right-side searchable active directory.

## Getting Started

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Production build
npm run build
```

The application runs by default at `http://localhost:5173`.
