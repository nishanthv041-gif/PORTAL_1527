import fs from "fs";
import path from "path";

// Size Thresholds (Constants)
export const WARN_THRESHOLD_BYTES = 190 * 1024 * 1024; // 190 MiB = 199,229,440 B
export const FAIL_THRESHOLD_BYTES = 205 * 1024 * 1024; // 205 MiB = 214,958,080 B
export const AMPLIFY_MAX_LIMIT_BYTES = 230686720;       // 220 MiB = 230,686,720 B (Hard ceiling)

const ROOT_DIR = process.cwd();
const NEXT_DIR = path.join(ROOT_DIR, ".next");

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB (${bytes.toLocaleString()} bytes)`;
}

function getAllPackagedFiles(dirPath) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;

  function walk(current) {
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        const relPath = path.relative(NEXT_DIR, fullPath).replace(/\\/g, "/");

        // Skip .next/cache if not yet moved
        if (relPath.startsWith("cache/") || relPath === "cache") {
          continue;
        }

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            files.push({
              path: path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/"),
              size: stat.size,
            });
          } catch {}
        }
      }
    } catch {}
  }

  walk(dirPath);
  return files;
}

console.log("================================================================================");
console.log("AWS AMPLIFY DEPLOYMENT PACKAGED SIZE GUARD & AUDIT");
console.log("================================================================================\n");

if (!fs.existsSync(NEXT_DIR)) {
  console.error("❌ Error: .next directory does not exist. Run 'npm run build' first.");
  process.exit(1);
}

const packagedFiles = getAllPackagedFiles(NEXT_DIR);
const totalPackagedBytes = packagedFiles.reduce((acc, f) => acc + f.size, 0);
const headroomBytes = AMPLIFY_MAX_LIMIT_BYTES - totalPackagedBytes;
const headroomMB = headroomBytes / (1024 * 1024);

console.log(`- Packaged Output Size   : ${formatBytes(totalPackagedBytes)} [${packagedFiles.length} files]`);
console.log(`- AWS Amplify Hard Limit : ${formatBytes(AMPLIFY_MAX_LIMIT_BYTES)} (220.00 MiB)`);
console.log(`- Warning Threshold      : ${formatBytes(WARN_THRESHOLD_BYTES)} (190.00 MiB)`);
console.log(`- Failure Threshold      : ${formatBytes(FAIL_THRESHOLD_BYTES)} (205.00 MiB)`);
console.log(`- Available Headroom     : ${formatBytes(headroomBytes)} (${headroomMB.toFixed(2)} MB free)\n`);

// Print Top 20 Largest Contributors
console.log("--- TOP 20 LARGEST PACKAGED FILES ---");
packagedFiles.sort((a, b) => b.size - a.size);
packagedFiles.slice(0, 20).forEach((f, idx) => {
  console.log(`  ${String(idx + 1).padStart(2)}. ${f.path.padEnd(70)}: ${formatBytes(f.size)}`);
});
console.log("");

// Evaluate against thresholds
if (totalPackagedBytes > FAIL_THRESHOLD_BYTES) {
  console.error("================================================================================");
  console.error(`❌ BUILD FAILED: Total packaged size (${formatBytes(totalPackagedBytes)}) exceeds the failure threshold of ${formatBytes(FAIL_THRESHOLD_BYTES)}!`);
  console.error("Action required: Reduce bundle size, remove unneeded dependencies, or split heavy routes before deploying.");
  console.error("================================================================================\n");
  process.exit(1);
}

if (totalPackagedBytes > WARN_THRESHOLD_BYTES) {
  console.warn("================================================================================");
  console.warn(`⚠️ WARNING: Total packaged size (${formatBytes(totalPackagedBytes)}) is approaching the limit. Headroom: ${headroomMB.toFixed(2)} MB.`);
  console.warn("================================================================================\n");
} else {
  console.log("================================================================================");
  console.log(`✅ BUILD SIZE HEALTHY: ${headroomMB.toFixed(2)} MB of headroom available (> ${formatBytes(headroomBytes)} below limit).`);
  console.log("================================================================================\n");
}

process.exit(0);

