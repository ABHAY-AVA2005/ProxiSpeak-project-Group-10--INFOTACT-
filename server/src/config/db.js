import mongoose from "mongoose";

let isConnected = false;

/**
 * Connect to MongoDB instance if MONGODB_URI is provided
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("ℹ️ MONGODB_URI not set. Running with in-memory persistence only.");
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
  return mongoose.connection.readyState === 1;
}
