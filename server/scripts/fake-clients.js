"use strict";

const { io } = require("socket.io-client");
const { CANVAS_BOUNDS, isValidCoordinate } = require("../utils/validation");

/**
 * Parse command-line arguments and environment variables with defaults.
 *
 * @param {string[]} [argv] - Argument vector (defaults to process.argv.slice(2))
 * @returns {object} Parsed options
 */
function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        url: process.env.SERVER_URL || "http://localhost:5000",
        clients: parseInt(process.env.CLIENT_COUNT, 10) || 5,
        duration: parseInt(process.env.DURATION_MS, 10) || 5000,
        interval: parseInt(process.env.MOVE_INTERVAL_MS, 10) || 250,
        timeout: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 4000,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if ((arg === "--clients" || arg === "-c") && argv[i + 1]) {
            options.clients = parseInt(argv[++i], 10) || options.clients;
        } else if ((arg === "--duration" || arg === "-d") && argv[i + 1]) {
            options.duration = parseInt(argv[++i], 10) || options.duration;
        } else if ((arg === "--interval" || arg === "-i") && argv[i + 1]) {
            options.interval = parseInt(argv[++i], 10) || options.interval;
        } else if ((arg === "--url" || arg === "-u") && argv[i + 1]) {
            options.url = argv[++i];
        } else if ((arg === "--timeout" || arg === "-t") && argv[i + 1]) {
            options.timeout = parseInt(argv[++i], 10) || options.timeout;
        } else if (!arg.startsWith("-") && !isNaN(parseInt(arg, 10))) {
            options.clients = parseInt(arg, 10);
        }
    }

    return options;
}

/**
 * Spawns fake Socket.IO clients, simulates avatar movement, and reports metrics.
 *
 * @param {object} [opts] - Configuration options
 * @returns {Promise<object>} Summary statistics
 */
async function runFakeClients(opts = {}) {
    const options = {
        url: opts.url || "http://localhost:5000",
        clients: typeof opts.clients === "number" ? opts.clients : 5,
        duration: typeof opts.duration === "number" ? opts.duration : 5000,
        interval: typeof opts.interval === "number" ? opts.interval : 250,
        timeout: typeof opts.timeout === "number" ? opts.timeout : 4000,
    };

    console.log("==================================================");
    console.log("       ProxiSpeak Fake Socket.IO Clients Test     ");
    console.log("==================================================");
    console.log(`Target Server URL:   ${options.url}`);
    console.log(`Configured Clients:  ${options.clients}`);
    console.log(`Test Duration:       ${options.duration}ms`);
    console.log(`Movement Interval:   ${options.interval}ms`);
    console.log(`Connect Timeout:     ${options.timeout}ms`);
    console.log("--------------------------------------------------");

    const stats = {
        configuredClients: options.clients,
        serverUrl: options.url,
        connectedCount: 0,
        connectionErrors: 0,
        errorMessages: [],
        playerMoveEmitted: 0,
        playerMovedReceived: 0,
        currentPlayersReceived: 0,
        playerJoinedReceived: 0,
        playerDisconnectedReceived: 0,
        disconnectedCount: 0,
        startTime: Date.now(),
        endTime: null,
        durationMs: 0,
        success: false,
    };

    const sockets = [];
    const moveIntervals = [];
    let isTerminating = false;

    return new Promise((resolve) => {
        // Watchdog timer: detect if server is unavailable within timeout window
        const connectWatchdog = setTimeout(() => {
            if (stats.connectedCount === 0 && !isTerminating) {
                console.error(
                    `\n[ERROR] Connection timed out after ${options.timeout}ms.`
                );
                console.error(
                    `[ERROR] Could not connect to Socket.IO server at ${options.url}.`
                );
                console.error(
                    "[ERROR] Please verify that the backend server is running.\n"
                );
                terminate(false, "Server unreachable or connection timed out");
            }
        }, options.timeout);

        // Overall test duration timer
        let durationTimer = null;

        // Clean termination helper
        async function terminate(success, reason) {
            if (isTerminating) return;
            isTerminating = true;

            clearTimeout(connectWatchdog);
            if (durationTimer) clearTimeout(durationTimer);

            // Stop all movement generation intervals
            for (const intervalId of moveIntervals) {
                clearInterval(intervalId);
            }
            moveIntervals.length = 0;

            // Disconnect every socket cleanly
            for (const socket of sockets) {
                if (socket.connected) {
                    socket.disconnect();
                }
            }

            // Brief grace period for disconnect acknowledgements
            await new Promise((r) => setTimeout(r, 300));

            // Force close any remaining open socket transports
            for (const socket of sockets) {
                socket.close();
            }

            stats.endTime = Date.now();
            stats.durationMs = stats.endTime - stats.startTime;
            stats.success = success;

            printSummary(stats, reason);
            resolve(stats);
        }

        // Spawn configured number of clients
        for (let i = 0; i < options.clients; i++) {
            const clientIndex = i + 1;
            const clientState = {
                index: clientIndex,
                x: 400,
                y: 400,
            };

            const socket = io(options.url, {
                transports: ["websocket", "polling"],
                reconnection: false,
                timeout: options.timeout,
            });
            sockets.push(socket);

            socket.on("connect", () => {
                stats.connectedCount++;
                console.log(
                    `[Client ${clientIndex}] Connected (socket id: ${socket.id})`
                );

                // Start movement simulation for this client
                const intervalId = setInterval(() => {
                    if (!socket.connected || isTerminating) return;

                    // Generate smooth random walk within 1000x600 canvas
                    const dx = Math.floor(Math.random() * 21) - 10; // -10 to +10
                    const dy = Math.floor(Math.random() * 21) - 10;

                    let newX = clientState.x + dx;
                    let newY = clientState.y + dy;

                    // Clamp to bounds
                    newX = Math.max(
                        CANVAS_BOUNDS.MIN_X,
                        Math.min(CANVAS_BOUNDS.MAX_X, newX)
                    );
                    newY = Math.max(
                        CANVAS_BOUNDS.MIN_Y,
                        Math.min(CANVAS_BOUNDS.MAX_Y, newY)
                    );

                    if (isValidCoordinate(newX, newY)) {
                        clientState.x = newX;
                        clientState.y = newY;

                        socket.emit("player-move", {
                            x: clientState.x,
                            y: clientState.y,
                        });
                        stats.playerMoveEmitted++;
                    }
                }, options.interval);

                moveIntervals.push(intervalId);

                // If all configured clients are connected, start test duration timer
                if (stats.connectedCount === options.clients && !durationTimer) {
                    console.log(
                        `\nAll ${options.clients} clients connected. Simulating movement for ${options.duration}ms...\n`
                    );
                    durationTimer = setTimeout(() => {
                        terminate(true, "Test duration completed");
                    }, options.duration);
                }
            });

            socket.on("current-players", () => {
                stats.currentPlayersReceived++;
            });

            socket.on("player-joined", () => {
                stats.playerJoinedReceived++;
            });

            socket.on("player-moved", () => {
                stats.playerMovedReceived++;
            });

            socket.on("player-disconnected", () => {
                stats.playerDisconnectedReceived++;
            });

            socket.on("connect_error", (err) => {
                stats.connectionErrors++;
                const errMsg = err.message || String(err);
                if (!stats.errorMessages.includes(errMsg)) {
                    stats.errorMessages.push(errMsg);
                }
                console.error(
                    `[Client ${clientIndex}] Connection error: ${errMsg}`
                );

                // If all clients failed to connect, terminate early
                if (
                    stats.connectionErrors >= options.clients &&
                    stats.connectedCount === 0
                ) {
                    terminate(false, "All clients failed to connect");
                }
            });

            socket.on("disconnect", (reason) => {
                stats.disconnectedCount++;
                if (!isTerminating) {
                    console.log(
                        `[Client ${clientIndex}] Disconnected: ${reason}`
                    );
                }
            });
        }

        // Handle process interruption gracefully
        const handleInterrupt = () => {
            console.log("\nInterrupted by user. Terminating test cleanly...");
            terminate(stats.connectedCount > 0, "Interrupted by signal");
        };

        process.once("SIGINT", handleInterrupt);
        process.once("SIGTERM", handleInterrupt);
    });
}

/**
 * Print a formatted summary report of the test results.
 *
 * @param {object} stats - Recorded statistics
 * @param {string} [reason] - Completion reason
 */
function printSummary(stats, reason) {
    const durationSeconds = (stats.durationMs / 1000).toFixed(2);

    console.log("\n==================================================");
    console.log("                TEST RUN SUMMARY                  ");
    console.log("==================================================");
    console.log(`Target Server:             ${stats.serverUrl}`);
    console.log(`Configured Clients:        ${stats.configuredClients}`);
    console.log(
        `Connected Clients:         ${stats.connectedCount} / ${stats.configuredClients}`
    );
    console.log(`Connection Errors:         ${stats.connectionErrors}`);
    if (stats.errorMessages.length > 0) {
        console.log(`Error Details:             ${stats.errorMessages.join(", ")}`);
    }
    console.log(`Test Duration:             ${durationSeconds}s`);
    console.log(`Movement Events Emitted:   ${stats.playerMoveEmitted}`);
    console.log(`Movement Broadcasts Recv:  ${stats.playerMovedReceived}`);
    console.log(`Join Broadcasts Recv:      ${stats.playerJoinedReceived}`);
    console.log(`Disconnect Broadcasts:     ${stats.playerDisconnectedReceived}`);
    console.log(
        `Cleanly Disconnected:      ${stats.disconnectedCount} / ${stats.configuredClients}`
    );
    if (reason) {
        console.log(`Outcome Reason:            ${reason}`);
    }
    console.log("==================================================");
    console.log(
        `Final Status:              ${stats.success ? "SUCCESS" : "FAILED"}`
    );
    console.log("==================================================\n");
}

// Execute standalone when run from terminal
if (require.main === module) {
    const options = parseArgs();
    runFakeClients(options)
        .then((stats) => {
            process.exit(stats.success ? 0 : 1);
        })
        .catch((err) => {
            console.error("[FATAL ERROR]", err);
            process.exit(1);
        });
}

module.exports = {
    runFakeClients,
    parseArgs,
    printSummary,
};
