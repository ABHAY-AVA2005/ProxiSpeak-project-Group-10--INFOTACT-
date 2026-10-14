import { addUser, removeUser, getAllUsers, updateUserPosition } from "../services/userManager.js";

/**
 * Register all Socket.io event listeners
 * @param {import("socket.io").Server} io - Socket.io server instance
 */
export function setupSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id}`);

    /**
     * User joins world
     * Payload: { username?: string, x?: number, y?: number }
     */
    socket.on("join", (payload = {}) => {
      // Guard against non-object payloads
      if (typeof payload !== "object" || payload === null) {
        payload = {};
      }

      const { username, x, y } = payload;
      const newUser = addUser(socket.id, username, x, y);

      console.log(`[User Joined] ${newUser.username} (${newUser.socketId}) at [${newUser.x}, ${newUser.y}]`);

      // 1. Send the current user snapshot to the joining user
      socket.emit("users:list", getAllUsers());

      // 2. Broadcast to all OTHER users that someone joined
      socket.broadcast.emit("user:joined", newUser);
    });

    /**
     * Disconnect cleanup
     */
    socket.on("disconnect", (reason) => {
      const removedUser = removeUser(socket.id);
      console.log(`[Socket Disconnected] ID: ${socket.id} (Reason: ${reason})`);

      if (removedUser) {
        // Broadcast user departure so all clients remove the avatar immediately
        socket.broadcast.emit("user:left", { socketId: socket.id });
      }
    });
  });
}
