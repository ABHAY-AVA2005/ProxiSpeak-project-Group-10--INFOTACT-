import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/proxispeak";

function isExactPosition2d(index) {
  return index.key && index.key.position === "2d" && Object.keys(index.key).length === 1;
}

function isExactLocation2dSphere(index) {
  return index.key && index.key.location === "2dsphere" && Object.keys(index.key).length === 1;
}

export async function runIndexMigration() {
  console.log("=================================================");
  console.log("  ProxiSpeak MongoDB Geospatial Index Migration  ");
  console.log("=================================================\n");

  try {
    await mongoose.connect(MONGODB_URI);
    const db = mongoose.connection.db;
    const collection = db.collection("players");

    const initialIndexes = await collection.indexes();
    console.log(`[1/3] Found ${initialIndexes.length} existing indexes.`);

    const obsoleteIndex = initialIndexes.find(isExactLocation2dSphere);
    if (obsoleteIndex) {
      console.log(`[2/3] Dropping obsolete 2dsphere index "${obsoleteIndex.name}"...`);
      await collection.dropIndex(obsoleteIndex.name);
      console.log("  ✔ Obsolete index dropped.");
    } else {
      console.log("[2/3] No obsolete 2dsphere index found.");
    }

    const refreshedIndexes = await collection.indexes();
    const existingPosition2d = refreshedIndexes.find(isExactPosition2d);

    if (existingPosition2d) {
      console.log(`[3/3] ✔ 2D index on 'position' already exists: "${existingPosition2d.name}".`);
    } else {
      console.log("[3/3] Creating 2D index on 'position' ({ position: '2d' })...");
      await collection.createIndex({ position: "2d" }, { name: "position_2d" });
      console.log("  ✔ Created 2D index successfully.");
    }

    // Final verification of index configuration
    const finalIndexes = await collection.indexes();
    const hasExact2d = finalIndexes.some(isExactPosition2d);
    const hasObsolete2dsphere = finalIndexes.some(isExactLocation2dSphere);

    if (!hasExact2d || hasObsolete2dsphere) {
      throw new Error(
        `Migration verification failed: 2d index present: ${hasExact2d}, obsolete 2dsphere present: ${hasObsolete2dsphere}`
      );
    }
    console.log("  ✔ Verified: { position: '2d' } active and obsolete indexes removed.");
    console.log("\nMigration completed successfully!");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate-indexes.js")) {
  runIndexMigration();
}
