/**
 * ProxiSpeak Spatial Audit Script Runner (Bridge to ESM)
 * Runs: node src/scripts/spatial-audit.js
 */

import("../src/scripts/spatial-audit.js")
  .then(({ runSpatialAudit }) => runSpatialAudit())
  .catch((err) => {
    console.error("Failed to execute spatial audit:", err);
    process.exit(1);
  });
