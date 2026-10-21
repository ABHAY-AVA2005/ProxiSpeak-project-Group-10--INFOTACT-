import { io } from "socket.io-client";

// Simulation defaults
const DEFAULT_URL = process.env.SERVER_URL || "http://localhost:5000";
const DEFAULT_CLIENTS = 10;
const DEFAULT_DURATION_MS = 5000;
const DEFAULT_INTERVAL_MS = 200; // ~5 emits/sec per client
const DEFAULT_TIMEOUT_MS = 5000;

export function parseArgs(args = process.argv.slice(2)) {
  const options = {
    url: DEFAULT_URL,
    clients: DEFAULT_CLIENTS,
    duration: DEFAULT_DURATION_MS,
    interval: DEFAULT_INTERVAL_MS,
    timeout: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--url" && args[i + 1]) options.url = args[++i];
    else if (arg === "--clients" && args[i + 1]) options.clients = parseInt(args[++i], 10);
    else if (arg === "--duration" && args[i + 1]) options.duration = parseInt(args[++i], 10);
    else if (arg === "--interval" && args[i + 1]) options.interval = parseInt(args[++i], 10);
    else if (arg === "--timeout" && args[i + 1]) options.timeout = parseInt(args[++i], 10);
  }

  return options;
}

export function runFakeClients(options = parseArgs()) {
  return new Promise((resolve) => {
    console.log("==================================================");
    console.log("    ProxiSpeak Socket.IO Fake Client Simulator    ");
    console.log("==================================================");
    console.log(`Target URL:       ${options.url}`);
    console.log(`Client Count:     ${options.clients}`);
    console.log(`Duration:         ${options.duration}ms`);
    console.log(`Move Interval:    ${options.interval}ms`);
    console.log("==================================================\n");

    const sockets = [];
    const moveIntervals = [];
    let isTerminating = false;

    const stats = {
      serverUrl: options.url,
      configuredClients: options.clients,
      connectedCount: 0,
      disconnectedCount: 0,
      connectionErrors: 0,
      moveEmitted: 0,
      moveReceived: 0,
      usersListReceived: 0,
      userJoinedReceived: 0,
      userLeftReceived: 0,
      startTime: Date.now(),
      endTime: null,
      durationMs: 0,
      success: false,
    };

    const watchdog = setTimeout(() => {
      if (stats.connectedCount < options.clients && !isTerminating) {
        console.error("[ERROR] Connection timeout reached.");
        terminate(false, "Connection timed out");
      }
    }, options.timeout);

    let durationTimer = null;

    async function terminate(success, reason) {
      if (isTerminating) return;
      isTerminating = true;

      clearTimeout(watchdog);
      if (durationTimer) clearTimeout(durationTimer);

      for (const id of moveIntervals) clearInterval(id);
      moveIntervals.length = 0;

      for (const socket of sockets) {
        if (socket.connected) socket.disconnect();
      }

      await new Promise((r) => setTimeout(r, 200));
      for (const socket of sockets) socket.close();

      stats.endTime = Date.now();
      stats.durationMs = stats.endTime - stats.startTime;
      stats.success = success;

      printSummary(stats, reason);
      resolve(stats);
    }

    for (let i = 0; i < options.clients; i++) {
      const clientIndex = i + 1;
      const state = {
        x: 400 + (i * 20) % 200,
        y: 400 + (i * 20) % 200,
      };

      const socket = io(options.url, {
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: options.timeout,
      });
      sockets.push(socket);

      socket.on("connect", () => {
        stats.connectedCount++;
        console.log(`[Client ${clientIndex}] Connected (id: ${socket.id})`);

        // Send join payload
        socket.emit("join", {
          username: `Bot_${clientIndex}`,
          x: state.x,
          y: state.y,
        });

        // Start random movement
        const intervalId = setInterval(() => {
          if (!socket.connected || isTerminating) return;

          const dx = Math.floor(Math.random() * 21) - 10;
          const dy = Math.floor(Math.random() * 21) - 10;

          state.x = Math.max(0, Math.min(2000, state.x + dx));
          state.y = Math.max(0, Math.min(2000, state.y + dy));

          socket.emit("move", { x: state.x, y: state.y });
          stats.moveEmitted++;
        }, options.interval);

        moveIntervals.push(intervalId);

        if (stats.connectedCount === options.clients && !durationTimer) {
          console.log(`\nAll ${options.clients} clients connected. Simulating movement...\n`);
          durationTimer = setTimeout(() => {
            terminate(true, "Test duration completed");
          }, options.duration);
        }
      });

      socket.on("users:list", () => { stats.usersListReceived++; });
      socket.on("user:joined", () => { stats.userJoinedReceived++; });
      socket.on("user:moved", () => { stats.moveReceived++; });
      socket.on("user:left", () => { stats.userLeftReceived++; });

      socket.on("connect_error", (err) => {
        stats.connectionErrors++;
        console.error(`[Client ${clientIndex}] Connection error: ${err.message}`);
        if (stats.connectionErrors >= options.clients && stats.connectedCount === 0) {
          terminate(false, "All clients failed to connect");
        }
      });

      socket.on("disconnect", () => {
        stats.disconnectedCount++;
      });
    }

    const handleSig = () => {
      console.log("\nInterrupted by user. Terminating...");
      terminate(stats.connectedCount > 0, "Signal interrupted");
    };

    process.once("SIGINT", handleSig);
    process.once("SIGTERM", handleSig);
  });
}

function printSummary(stats, reason) {
  const durationSec = (stats.durationMs / 1000).toFixed(2);
  console.log("\n==================================================");
  console.log("            SIMULATION TEST SUMMARY               ");
  console.log("==================================================");
  console.log(`Target Server:          ${stats.serverUrl}`);
  console.log(`Clients Configured:     ${stats.configuredClients}`);
  console.log(`Clients Connected:      ${stats.connectedCount} / ${stats.configuredClients}`);
  console.log(`Connection Errors:      ${stats.connectionErrors}`);
  console.log(`Test Duration:          ${durationSec}s`);
  console.log(`Move Events Emitted:    ${stats.moveEmitted}`);
  console.log(`Move Broadcasts Recv:   ${stats.moveReceived}`);
  console.log(`Clean Disconnects:      ${stats.disconnectedCount} / ${stats.configuredClients}`);
  if (reason) console.log(`Outcome Reason:         ${reason}`);
  console.log("==================================================");
  console.log(`Final Status:           ${stats.success ? "SUCCESS" : "FAILED"}`);
  console.log("==================================================\n");
}

if (process.argv[1] && process.argv[1].endsWith("fake-clients.js")) {
  runFakeClients()
    .then((stats) => process.exit(stats.success ? 0 : 1))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
