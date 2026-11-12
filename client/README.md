# ProxiSpeak Client

The React + Vite frontend for the ProxiSpeak virtual office.

## Features

- Interactive office map with room selection, keyboard movement, and
  click-to-move navigation.
- Proximity-based WebRTC voice with adjustable distance and spatial audio.
- Room chat and All chat modes, plus direct messages from the Team directory.
- WebRTC screen sharing.
- Responsive interface, live presence, and teammate directory.

## Development

```powershell
npm install
npm run dev
```

Vite serves the app at `http://localhost:5173`. By default, the client connects
to `http://localhost:5000`. To use another backend, set `VITE_SERVER_URL` in a
client environment file, for example:

```env
VITE_SERVER_URL=https://your-server.example.com
```

Build and lint:

```powershell
npm run build
npm run lint
```

## Production

The deployed client is hosted on
[Vercel](https://proxi-speak-project-group-10-infota.vercel.app/). Set
`VITE_SERVER_URL` to the public HTTPS URL of the Socket.IO server. See the
[deployment guide](../docs/DEPLOYMENT.md) for the full Vercel and Render setup.
