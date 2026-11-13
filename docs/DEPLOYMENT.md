# ProxiSpeak Deployment

Last checked: **12 November 2026**

## Live services

| Service | Address | Hosting |
|---|---|---|
| Web app | [https://proxi-speak-project-group-10-infota.vercel.app/](https://proxi-speak-project-group-10-infota.vercel.app/) | Vercel |
| Realtime backend | [https://proxispeak-server-hkvz.onrender.com](https://proxispeak-server-hkvz.onrender.com) | Render |
| Backend health | [https://proxispeak-server-hkvz.onrender.com/health](https://proxispeak-server-hkvz.onrender.com/health) | Render |

The backend health endpoint returned `status: "ok"` when checked on
12 November 2026. It reported Redis connected and MongoDB disconnected. This
confirms that the production backend can connect to the configured Redis
service; it does not by itself verify cross-instance behavior, which requires
multiple backend instances.

## Service layout

```text
Browser
  ├─ Static React/Vite app ───────── Vercel
  └─ Socket.IO, HTTP API ─────────── Render
       ├─ Optional persistence ───── MongoDB
       └─ Cross-instance events ──── Upstash Redis
```

The browser connects to the realtime backend over HTTPS/WSS. WebRTC negotiates
peer-to-peer audio and screen-share media between browsers; the backend relays
signaling and handles office state, presence, and chat.

## Vercel: frontend

The Vercel project should use the GitHub repository with these settings:

| Setting | Value |
|---|---|
| Root directory | `client` |
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `VITE_SERVER_URL=https://proxispeak-server-hkvz.onrender.com` |

Set `VITE_SERVER_URL` for each environment where the deployed frontend should
connect to the Render backend. It is embedded at build time, so redeploy the
frontend after changing it.

## Render: realtime backend

The repository's [`render.yaml`](../render.yaml) defines the backend Blueprint:

| Setting | Value |
|---|---|
| Root directory | `server` |
| Runtime | Node.js |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health-check path | `/health` |
| Plan | Free |
| `CLIENT_URL` | `https://proxi-speak-project-group-10-infota.vercel.app` |
| `REDIS_ENABLED` | `true` |
| `REDIS_URL` | Private Upstash connection URL; set in Render, not Git |

`CLIENT_URL` must be the frontend's origin (scheme and hostname, without a
path); the server uses it for HTTP and Socket.IO CORS. If the Vercel domain
changes, update this value in Render and in `render.yaml`, then redeploy.

Optional backend environment variables:

| Variable | Purpose |
|---|---|
| `PORT` | Supplied by Render; local default is `5000`. |
| `MONGODB_URI` | MongoDB connection string for optional persistence. Keep it secret. |
| `REDIS_URL` | Upstash Redis connection URL. Keep it secret. |
| `REDIS_ENABLED` | Set to `true` to enable Redis Pub/Sub and the Socket.IO adapter. |
| `MAX_PEERS` | Maximum nearby WebRTC peer connections per participant. |
| `INSTANCE_ID` | Optional instance label for logs and multi-instance coordination. |
| `RESEND_API_KEY` | Optional Resend API secret for meeting email invitations. Store it only in Render. |
| `EMAIL_FROM` | Optional verified sender address configured with Resend. |

Do not commit production connection strings or other secrets. Configure them in
the Render dashboard. A free Render service may spin down after inactivity, so
the first request after a quiet period can take longer.

Meeting schedules are shared per room. MongoDB is required for schedules to
survive backend restarts; if it is disconnected, schedules use server memory.
Invitation delivery is enabled only when both `RESEND_API_KEY` and `EMAIL_FROM`
are configured. The API reports when delivery is unavailable or rejected.

## Enable Upstash Redis

The server uses Redis Pub/Sub for cross-instance presence and proximity
signaling, and the Socket.IO Redis adapter for cross-instance broadcasts such
as room and meeting chat. Redis is required for these events to reach clients
connected to different backend instances.

Direct-message recipient lookup and chat history are currently kept in each
backend process. Do not treat those features as cross-instance until they are
moved to shared Redis-backed storage/routing.

1. Create a Redis database in the [Upstash Console](https://console.upstash.com/)
   and choose a region close to the Render backend.
2. In the database's connection details, copy the Redis URL for Node.js /
   `ioredis` (typically starts with `rediss://`). Keep it private; it contains
   the database password.
3. In the Render service's **Environment** settings, add `REDIS_URL` with that
   connection URL as a secret. Keep `REDIS_ENABLED` set to `true`. The
   `sync: false` declaration in `render.yaml` deliberately keeps the secret
   out of Git.
4. Redeploy Render. Check the [health endpoint](https://proxispeak-server-hkvz.onrender.com/health)
   and confirm `"redis":{"connected":true}`. If it is false, check Render logs
   and verify the URL.
5. To use Redis for **cross-instance** operation, run more than one backend
   instance on a Render plan that supports scaling. A single instance can
   connect to Redis but does not benefit from inter-instance messaging.

Provisioning Upstash and adding its secret in Render requires access to those
accounts. Never paste the URL into chat, source code, or a commit.

## Deploying updates

1. Verify and commit the intended changes on the deployment branch (`main`).
2. Push the commit to GitHub.
3. If repository auto-deploy is enabled, wait for the Vercel and Render
   deployments to complete. Otherwise, deploy the latest commit from each
   provider's dashboard.
4. Open the Vercel URL and check the backend health endpoint.
5. Test microphone permission, room joining, chat delivery, and screen sharing
   in two browser sessions.

Frontend-only changes require a Vercel deployment. Backend changes require a
Render deployment. Changes to Vercel build-time environment variables require
rebuilding the frontend.

## Health and troubleshooting

The `/health` endpoint returns JSON including `status`, `redis.connected`,
`database.connected`, and uptime. A `status: "ok"` response confirms the
backend is responding; `redis.connected: false` or
`database.connected: false` means those optional services are not connected,
not that the HTTP health endpoint failed.

- If the app loads but cannot join or chat, check Render logs and confirm
  `VITE_SERVER_URL` points to the Render service.
- If the backend rejects browser requests, check that Render's `CLIENT_URL`
  exactly matches the Vercel origin.
- If voice or screen sharing fails, use HTTPS and grant the browser's
  microphone or screen-capture permission.
- Chat history is in memory. It is not durable across backend restarts; direct
  chat history is tied to currently connected participants.
- If Redis is not configured, the server intentionally falls back to
  single-instance mode; the health endpoint reports
  `"redis":{"connected":false}`.

## Current repository state

The last pushed application commit is `3e6667a` on `main`. At the time this
guide was updated, additional local UI and branding edits were still
uncommitted, so they are not necessarily part of the live deployment. Check
GitHub and provider deployment logs for the exact revision currently running.
