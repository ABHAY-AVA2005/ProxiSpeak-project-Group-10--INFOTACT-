import mongoose from "mongoose";

let isConnected = false;

/**
 * Connect to MongoDB instance if MONGODB_URI or MONGO_URI is provided
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.log("ℹ️ MONGODB_URI/MONGO_URI not set. Running with in-memory persistence only.");
    return false;
  }

  if (isConnected || mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.log("Connected to MongoDB successfully");
    return true;
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    return false;
  }
}

export function isDbConnected() {
  // readyState 1 is connected, readyState 2 is connecting (Mongoose buffers operations until ready)
  return mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2;
}
