import { io } from "socket.io-client";
import { performance } from "node:perf_hooks";

/**
 * World canvas bounds matching client dimensions
 */
const WORLD_BOUNDS = Object.freeze({
  MIN_X: 50,
  MAX_X: 950,
  MIN_Y: 50,
  MAX_Y: 550
});

const DEFAULT_OPTIONS = Object.freeze({
  url: process.env.SERVER_URL || "http://localhost:5000",
  clients: parseInt(process.env.CLIENT_COUNT, 10) || 50,
  duration: parseInt(process.env.DURATION_MS, 10) || 6000,
  interval: parseInt(process.env.MOVE_INTERVAL_MS, 10) || 200,
  connectTimeout: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
  maxPeersCap: parseInt(process.env.MAX_PEERS, 10) || 8
});

/**
 * Parse CLI arguments
 * @param {string[]} [argv]
 * @returns {object}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const options = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === "--clients" || arg === "-c") && argv[i + 1]) {
      options.clients = parseInt(argv[++i], 10) || options.clients;
    } else if ((arg === "--duration" || arg === "-d") && argv[i + 1]) {
      options.duration = parseInt(argv[++i], 10) || options.duration;
    } else if ((arg === "--interval" || arg === "-i") && argv[i + 1]) {
      options.interval = parseInt(argv[++i], 10) || options.interval;
    } else if ((arg === "--timeout" || arg === "-t") && argv[i + 1]) {
      options.connectTimeout = parseInt(argv[++i], 10) || options.connectTimeout;
    } else if ((arg === "--url" || arg === "-u") && argv[i + 1]) {
      options.url = argv[++i];
    } else if (!arg.startsWith("-") && !isNaN(parseInt(arg, 10))) {
      options.clients = parseInt(arg, 10);
    }
  }

  return options;
}

/**
 * Executes the 50-client load test simulation
 * @param {object} [opts]
 * @returns {Promise<object>} Summary statistics
 */
export async function runLoadTest(opts = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  console.log("==================================================");
  console.log("       ProxiSpeak 50-Client Scale Load Test       ");
  console.log("==================================================");
  console.log(`Target Server:         ${options.url}`);
  console.log(`Simulated Clients:     ${options.clients}`);
  console.log(`Test Duration:         ${options.duration}ms`);
  console.log(`Movement Frequency:    ${1000 / options.interval} Hz (${options.interval}ms interval)`);
  console.log(`Max Peers Cap Guard:   ${options.maxPeersCap}`);
  console.log("--------------------------------------------------");

  const stats = {
    configuredClients: options.clients,
    serverUrl: options.url,
    connectedCount: 0,
    connectionErrors: 0,
    errorDetails: [],
    connectLatenciesMs: [],
    movesEmitted: 0,
    moveBroadcastsReceived: 0,
    nearbyEnterReceived: 0,
    nearbyLeaveReceived: 0,
    peerCapViolations: 0,
    startTime: performance.now(),
    endTime: null,
    durationMs: 0,
    success: false
  };

  const sockets = [];
  const moveIntervals = [];
  const clientPeerSets = new Map(); // socketIndex -> Set<peerId>
  let isTerminating = false;

  return new Promise((resolve) => {
    // Connection timeout watchdog
    const watchdogTimer = setTimeout(() => {
      if (stats.connectedCount === 0 && !isTerminating) {
        console.error(`\n[LOAD TEST ERROR] Server at ${options.url} unreachable after ${options.connectTimeout}ms.`);
        terminate(false, "Connection timeout: server offline");
      }
    }, options.connectTimeout);

    let durationTimer = null;

    async function terminate(success, reason) {
      if (isTerminating) return;
      isTerminating = true;

      clearTimeout(watchdogTimer);
      if (durationTimer) clearTimeout(durationTimer);

      for (const intervalId of moveIntervals) {
        clearInterval(intervalId);
      }
      moveIntervals.length = 0;

      for (const socket of sockets) {
        if (socket.connected) {
          socket.disconnect();
        }
      }

      await new Promise((r) => setTimeout(r, 200));

      for (const socket of sockets) {
        socket.close();
      }

      stats.endTime = performance.now();
      stats.durationMs = stats.endTime - stats.startTime;
      stats.success = success;

      printLoadTestSummary(stats, options, reason);
      resolve(stats);
    }

    // Spawn simulated clients with staggered jitter
    for (let i = 0; i < options.clients; i++) {
      const clientIndex = i + 1;
      const clientState = {
        index: clientIndex,
        // Distribute clients initially in cluster formations across canvas
        x: 100 + (i % 10) * 80 + Math.floor(Math.random() * 20),
        y: 100 + Math.floor(i / 10) * 80 + Math.floor(Math.random() * 20)
      };

      const peerSet = new Set();
      clientPeerSets.set(clientIndex, peerSet);

      const connStart = performance.now();
      const socket = io(options.url, {
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: options.connectTimeout
      });
      sockets.push(socket);

      socket.on("connect", () => {
        const connDuration = performance.now() - connStart;
        stats.connectLatenciesMs.push(connDuration);
        stats.connectedCount++;

        // Send initial join payload
        socket.emit("join", {
          username: `SimUser_${String(clientIndex).padStart(2, "0")}`,
          x: clientState.x,
          y: clientState.y
        });

        // Start random-walk movement simulation
        const intervalId = setInterval(() => {
          if (!socket.connected || isTerminating) return;

          // Velocity delta: -12 to +12 pixels per step
          const dx = Math.floor(Math.random() * 25) - 12;
          const dy = Math.floor(Math.random() * 25) - 12;

          let nx = clientState.x + dx;
          let ny = clientState.y + dy;

          // Clamp within world bounds
          nx = Math.max(WORLD_BOUNDS.MIN_X, Math.min(WORLD_BOUNDS.MAX_X, nx));
          ny = Math.max(WORLD_BOUNDS.MIN_Y, Math.min(WORLD_BOUNDS.MAX_Y, ny));

          clientState.x = nx;
          clientState.y = ny;

          socket.emit("move", { x: clientState.x, y: clientState.y });
          stats.movesEmitted++;
        }, options.interval);

        moveIntervals.push(intervalId);

        // When all clients have connected, begin duration countdown
        if (stats.connectedCount === options.clients && !durationTimer) {
          console.log(`\nAll ${options.clients} simulated clients connected! Running load simulation for ${options.duration}ms...\n`);
          durationTimer = setTimeout(() => {
            terminate(true, "Load test duration completed");
          }, options.duration);
        }
      });

      socket.on("user:moved", () => {
        stats.moveBroadcastsReceived++;
      });

      socket.on("nearby:enter", (data) => {
        stats.nearbyEnterReceived++;
        if (data?.socketId) {
          peerSet.add(data.socketId);
          if (peerSet.size > options.maxPeersCap) {
            stats.peerCapViolations++;
          }
        }
      });

      socket.on("nearby:leave", (data) => {
        stats.nearbyLeaveReceived++;
        if (data?.socketId) {
          peerSet.delete(data.socketId);
        }
      });

      socket.on("connect_error", (err) => {
        stats.connectionErrors++;
        const msg = err.message || String(err);
        if (!stats.errorDetails.includes(msg)) {
          stats.errorDetails.push(msg);
        }
        if (stats.connectionErrors >= options.clients && stats.connectedCount === 0) {
          terminate(false, "All clients failed to connect to server");
        }
      });
    }

    const handleSignal = () => {
      console.log("\nInterrupted by signal. Stopping load test...");
      terminate(stats.connectedCount > 0, "Process interrupted");
    };

    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
  });
}

/**
 * Format and print summary of load test metrics
 */
function printLoadTestSummary(stats, options, reason) {
  const durationSec = (stats.durationMs / 1000).toFixed(2);
  const lats = stats.connectLatenciesMs.sort((a, b) => a - b);
  const avgLat = lats.length > 0 ? (lats.reduce((a, b) => a + b, 0) / lats.length).toFixed(1) : "N/A";
  const p95Lat = lats.length > 0 ? lats[Math.floor(lats.length * 0.95)].toFixed(1) : "N/A";
  const minLat = lats.length > 0 ? lats[0].toFixed(1) : "N/A";
  const maxLat = lats.length > 0 ? lats[lats.length - 1].toFixed(1) : "N/A";

  console.log("\n==================================================");
  console.log("            LOAD TEST EXECUTION SUMMARY           ");
  console.log("==================================================");
  console.log(`Target Server URL:        ${stats.serverUrl}`);
  console.log(`Configured Clients:       ${stats.configuredClients}`);
  console.log(`Connected Clients:        ${stats.connectedCount} / ${stats.configuredClients}`);
  console.log(`Connection Errors:        ${stats.connectionErrors}`);
  if (stats.errorDetails.length > 0) {
    console.log(`Error Messages:           ${stats.errorDetails.join(", ")}`);
  }
  console.log(`Connect Latency (ms):     min: ${minLat} | avg: ${avgLat} | p95: ${p95Lat} | max: ${maxLat}`);
  console.log(`Simulation Duration:      ${durationSec}s`);
  console.log(`Movement Events Emitted:  ${stats.movesEmitted}`);
  console.log(`Move Broadcasts Received: ${stats.moveBroadcastsReceived}`);
  console.log(`Proximity 'enter' Events: ${stats.nearbyEnterReceived}`);
  console.log(`Proximity 'leave' Events: ${stats.nearbyLeaveReceived}`);
  console.log(`Nearest-N Cap Violations: ${stats.peerCapViolations} (Target: 0 violations > ${options.maxPeersCap} peers)`);
  console.log(`Outcome / Reason:         ${reason}`);
  console.log("==================================================");
  console.log(`Final Result:             ${stats.success ? "PASSED" : "FAILED"}`);
  console.log("==================================================\n");
}

if (process.argv[1] && process.argv[1].endsWith("load-test-50.js")) {
  const options = parseArgs();
  runLoadTest(options)
    .then((stats) => {
      process.exit(stats.success ? 0 : 1);
    })
    .catch((err) => {
      console.error("[FATAL LOAD TEST ERROR]", err);
      process.exit(1);
    });
}
