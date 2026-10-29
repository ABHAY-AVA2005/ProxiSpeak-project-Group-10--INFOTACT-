require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI =
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/proxispeak";

async function runIndexMigration() {
    console.log("==================================================");
    console.log("       ProxiSpeak MongoDB Index Migration Tool     ");
    console.log("==================================================");
    console.log(`Connecting to: ${MONGO_URI}`);

    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB successfully.\n");

        const collection = mongoose.connection.collection("players");

        // Document integrity safeguard: sample documents before migration (if any exist)
        const sampleBefore = await collection
            .find({}, { projection: { _id: 1, playerId: 1, position: 1, x: 1, y: 1 } })
            .limit(5)
            .toArray();

        // Exact key definition helper for obsolete 2dsphere index: { location: "2dsphere" }
        function isExactLocation2dSphere(idx) {
            return Boolean(
                idx &&
                idx.key &&
                idx.key.location === "2dsphere" &&
                Object.keys(idx.key).length === 1
            );
        }

        // Exact key definition helper for position 2d index: { position: "2d" }
        function isExactPosition2d(idx) {
            return Boolean(
                idx &&
                idx.key &&
                idx.key.position === "2d" &&
                Object.keys(idx.key).length === 1
            );
        }

        // 1. Inspect existing indexes
        console.log("[1/5] Inspecting existing indexes on 'players' collection...");
        const initialIndexes = await collection.indexes();
        console.log("Current indexes found:");
        initialIndexes.forEach((idx, i) => {
            console.log(
                `  ${i + 1}. Name: "${idx.name}", Key: ${JSON.stringify(idx.key)}`
            );
        });

        // 2. Identify obsolete index by exact key definition: { location: "2dsphere" }
        console.log("\n[2/5] Checking for obsolete index with exact key { location: \"2dsphere\" }...");
        const obsoleteIndex = initialIndexes.find(isExactLocation2dSphere);

        if (obsoleteIndex) {
            console.log(
                `  -> Found obsolete index: "${obsoleteIndex.name}" matching exact key ${JSON.stringify(obsoleteIndex.key)}.`
            );
            console.log(`  -> Dropping index "${obsoleteIndex.name}" safely...`);
            await collection.dropIndex(obsoleteIndex.name);
            console.log(`  -> Index "${obsoleteIndex.name}" dropped successfully.`);
        } else {
            console.log(
                "  -> No obsolete index matching exact key { location: \"2dsphere\" } found. Nothing to drop."
            );
        }

        // 3. Refresh index list from MongoDB after drop
        console.log("\n[3/5] Refreshing index list from MongoDB after drop operation...");
        const refreshedIndexes = await collection.indexes();
        console.log(`Refreshed index count: ${refreshedIndexes.length}`);
        const stillHasObsolete = refreshedIndexes.some(isExactLocation2dSphere);
        if (stillHasObsolete) {
            throw new Error(
                "Verification failed: Obsolete index { location: \"2dsphere\" } is still present after drop operation."
            );
        }
        console.log("  -> Confirmed: Obsolete index { location: \"2dsphere\" } is absent.");

        // 4. Create or verify 2d index on position: [x, y] using refreshed index list
        console.log("\n[4/5] Checking for index matching exact key { position: \"2d\" } in refreshed indexes...");
        const existingPositionIndex = refreshedIndexes.find(isExactPosition2d);

        if (existingPositionIndex) {
            console.log(
                `  -> 2D index already exists: "${existingPositionIndex.name}" matching exact key (${JSON.stringify(existingPositionIndex.key)}).`
            );
        } else {
            console.log(
                "  -> Creating 2D index on 'position' field ({ position: '2d' })..."
            );
            const indexName = await collection.createIndex(
                { position: "2d" },
                { name: "position_2d" }
            );
            console.log(`  -> Created 2D index: "${indexName}" successfully.`);
        }

        // 5. Final verification of all index definitions and document integrity
        console.log("\n[5/5] Final Verification of Index Definitions:");
        const finalIndexes = await collection.indexes();
        finalIndexes.forEach((idx, i) => {
            console.log(
                `  ${i + 1}. Name: "${idx.name}", Key: ${JSON.stringify(idx.key)}`
            );
        });

        // Exact key verification
        const positionIndexObj = finalIndexes.find(isExactPosition2d);
        const hasExact2d = Boolean(positionIndexObj);
        const hasObsolete2dsphere = finalIndexes.some(isExactLocation2dSphere);

        // Document integrity spot-check: strictly compare sampled fields (_id, playerId, position, x, y)
        let sampleCheckStatus = "SKIPPED_EMPTY"; // "SKIPPED_EMPTY" | "PASSED" | "FAILED"
        let sampleCheckDetails = "Collection is empty (0 documents to sample).";

        if (sampleBefore.length > 0) {
            const sampleAfter = await collection
                .find(
                    { _id: { $in: sampleBefore.map((d) => d._id) } },
                    { projection: { _id: 1, playerId: 1, position: 1, x: 1, y: 1 } }
                )
                .toArray();

            if (sampleAfter.length !== sampleBefore.length) {
                sampleCheckStatus = "FAILED";
                sampleCheckDetails = `Sample count mismatch: expected ${sampleBefore.length}, found ${sampleAfter.length}.`;
            } else {
                let allMatched = true;
                for (const beforeDoc of sampleBefore) {
                    const afterDoc = sampleAfter.find(
                        (d) => String(d._id) === String(beforeDoc._id)
                    );
                    if (!afterDoc) {
                        allMatched = false;
                        break;
                    }

                    // Strict comparison of every sampled field
                    const playerIdMatch = afterDoc.playerId === beforeDoc.playerId;
                    const xMatch = afterDoc.x === beforeDoc.x;
                    const yMatch = afterDoc.y === beforeDoc.y;
                    const positionMatch =
                        Array.isArray(beforeDoc.position) &&
                        Array.isArray(afterDoc.position)
                            ? beforeDoc.position.length === afterDoc.position.length &&
                              beforeDoc.position.every((v, i) => v === afterDoc.position[i])
                            : beforeDoc.position === afterDoc.position;

                    if (!playerIdMatch || !xMatch || !yMatch || !positionMatch) {
                        allMatched = false;
                        break;
                    }
                }

                if (allMatched) {
                    sampleCheckStatus = "PASSED";
                    sampleCheckDetails = `Verified ${sampleBefore.length} sampled document(s) (_id, playerId, position, x, y match exactly).`;
                } else {
                    sampleCheckStatus = "FAILED";
                    sampleCheckDetails = `Sample document data mismatch detected across sampled fields.`;
                }
            }
        }

        const totalDocCount = await collection.countDocuments();

        console.log("\n---------------- Migration Summary ----------------");
        console.log(`- Required { position: "2d" } index:   ${hasExact2d ? `VERIFIED (${JSON.stringify(positionIndexObj.key)})` : "FAILED (missing exact { position: \"2d\" } index)"}`);
        console.log(`- Obsolete { location: "2dsphere" }:   ${!hasObsolete2dsphere ? "VERIFIED ABSENT (PASSED)" : "FAILED (obsolete index still exists)"}`);
        console.log(`- Total document count (informational): ${totalDocCount} documents in collection`);

        if (sampleCheckStatus === "PASSED") {
            console.log(`- Sample document spot-check:           PASSED (${sampleCheckDetails})`);
            console.log(`  Note: Spot-check verified ${sampleBefore.length} sampled document(s); this does not substitute for a full collection audit.`);
        } else if (sampleCheckStatus === "SKIPPED_EMPTY") {
            console.log(`- Sample document spot-check:           NOT APPLICABLE (collection is empty)`);
        } else {
            console.log(`- Sample document spot-check:           FAILED (${sampleCheckDetails})`);
        }
        console.log("  Note: Migration issued only index DDL commands; no document deletion/update queries were executed.");
        console.log("---------------------------------------------------");

        const indexRequirementsMet = hasExact2d && !hasObsolete2dsphere;
        const sampleCheckPassed = sampleCheckStatus !== "FAILED";
        const migrationPassed = indexRequirementsMet && sampleCheckPassed;

        if (migrationPassed) {
            console.log("\n✔ Index migration verified successfully!");
        } else {
            console.error("\n✖ Migration verification FAILED:");
            if (!hasExact2d) console.error("  - Missing required index with exact key { position: \"2d\" }");
            if (hasObsolete2dsphere) console.error("  - Obsolete index with exact key { location: \"2dsphere\" } is still present");
            if (sampleCheckStatus === "FAILED") console.error(`  - Sample document spot-check failed: ${sampleCheckDetails}`);
            process.exitCode = 1;
        }
    } catch (err) {
        console.error("\n Migration error:", err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected from MongoDB.\n");
    }
}

if (require.main === module) {
    runIndexMigration();
}

module.exports = { runIndexMigration };
