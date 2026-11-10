import fs from "fs";
import path from "path";

const AMPLIFY_LIMIT_BYTES = 230686720; // 220 MiB
const ROOT_DIR = process.cwd();

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB (${bytes.toLocaleString()} B)`;
}

function getDirStats(dirPath) {
  if (!fs.existsSync(dirPath)) return { bytes: 0, filesCount: 0 };
  let bytes = 0;
  let filesCount = 0;

  function walk(current) {
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            bytes += stat.size;
            filesCount++;
          } catch {}
        }
      }
    } catch {}
  }

  walk(dirPath);
  return { bytes, filesCount };
}

function getAllFiles(dirPath, relativeTo = ROOT_DIR) {
  const files = [];
  if (!fs.existsSync(dirPath)) return files;

  function walk(current) {
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            files.push({
              path: path.relative(relativeTo, fullPath).replace(/\\/g, "/"),
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

function getSubdirSizes(parentDir, maxDepth = 2) {
  const results = [];
  if (!fs.existsSync(parentDir)) return results;

  function walk(current, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(current, entry.name);
          const stats = getDirStats(fullPath);
          results.push({
            dir: path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/"),
            bytes: stats.bytes,
            filesCount: stats.filesCount,
          });
          walk(fullPath, depth + 1);
        }
      }
    } catch {}
  }

  walk(parentDir, 1);
  return results.sort((a, b) => b.bytes - a.bytes);
}

console.log("================================================================================");
console.log("PORTAL_1527: BUILD OUTPUT & DEPENDENCY SIZE AUDIT");
console.log("================================================================================\n");

// 1. High-Level Folder Totals
const dotNextStats = getDirStats(path.join(ROOT_DIR, ".next"));
const dotNextCacheStats = getDirStats(path.join(ROOT_DIR, ".next", "cache"));
const dotNextServerStats = getDirStats(path.join(ROOT_DIR, ".next", "server"));
const dotNextStaticStats = getDirStats(path.join(ROOT_DIR, ".next", "static"));
const dotNextStandaloneStats = getDirStats(path.join(ROOT_DIR, ".next", "standalone"));
const publicStats = getDirStats(path.join(ROOT_DIR, "public"));
const nodeModulesStats = getDirStats(path.join(ROOT_DIR, "node_modules"));

const dotNextWithoutCacheBytes = dotNextStats.bytes - dotNextCacheStats.bytes;

console.log("--- 1. DIRECTORY TOTALS ---");
console.log(`- .next (Total on disk)         : ${formatBytes(dotNextStats.bytes)} [${dotNextStats.filesCount} files]`);
console.log(`  ├── .next/cache (Build Cache) : ${formatBytes(dotNextCacheStats.bytes)} [${dotNextCacheStats.filesCount} files]`);
console.log(`  ├── .next/server (SSR routes) : ${formatBytes(dotNextServerStats.bytes)} [${dotNextServerStats.filesCount} files]`);
console.log(`  ├── .next/static (JS/CSS/PWA) : ${formatBytes(dotNextStaticStats.bytes)} [${dotNextStaticStats.filesCount} files]`);
console.log(`  └── .next/standalone          : ${formatBytes(dotNextStandaloneStats.bytes)} [${dotNextStandaloneStats.filesCount} files]`);
console.log(`- .next WITHOUT .next/cache     : ${formatBytes(dotNextWithoutCacheBytes)} (Amplify target if cache excluded)`);
console.log(`- public/                       : ${formatBytes(publicStats.bytes)} [${publicStats.filesCount} files]`);
console.log(`- node_modules/                 : ${formatBytes(nodeModulesStats.bytes)} [${nodeModulesStats.filesCount} files]`);
console.log(`\n- AWS Amplify Max Limit         : ${formatBytes(AMPLIFY_LIMIT_BYTES)} (220.00 MiB)`);

const diffWithCache = dotNextStats.bytes - AMPLIFY_LIMIT_BYTES;
const diffWithoutCache = dotNextWithoutCacheBytes - AMPLIFY_LIMIT_BYTES;
console.log(`- Over/Under WITH cache         : ${diffWithCache > 0 ? "+" : ""}${formatBytes(diffWithCache)} ${diffWithCache > 0 ? "❌ EXCEEDS LIMIT" : "✅ WITHIN LIMIT"}`);
console.log(`- Headroom WITHOUT cache        : ${diffWithoutCache < 0 ? formatBytes(-diffWithoutCache) + " HEADROOM ✅" : "+" + formatBytes(diffWithoutCache) + " OVER LIMIT ❌"}`);

// 2. Specific Heavy Libraries
console.log("\n--- 2. HEAVY LIBRARIES & RUNTIME ENGINE BINARIES ---");
const specificTargets = [
  { label: "Prisma Client (.prisma/client)", path: "node_modules/.prisma/client" },
  { label: "Prisma CLI (@prisma/client)", path: "node_modules/@prisma/client" },
  { label: "Prisma Engines (@prisma/engines)", path: "node_modules/@prisma/engines" },
  { label: "Prisma Schema Engine", path: "node_modules/prisma" },
  { label: "Tesseract Public Assets", path: "public/tesseract" },
  { label: "Public Logos & Images", path: "public/logo" },
  { label: "Public PWA Icons", path: "public/icons" },
  { label: "XLSX Package", path: "node_modules/xlsx" },
  { label: "PDFKit Package", path: "node_modules/pdfkit" },
  { label: "Lucide React Icons", path: "node_modules/lucide-react" },
  { label: "TypeScript", path: "node_modules/typescript" },
  { label: "@swc Binaries", path: "node_modules/@swc" },
  { label: "Sharp & @img binaries", path: "node_modules/sharp" },
  { label: "@img packages", path: "node_modules/@img" },
  { label: "AWS SDK packages", path: "node_modules/@aws-sdk" },
  { label: "Google Generative AI SDK", path: "node_modules/@google" },
];

for (const t of specificTargets) {
  const full = path.join(ROOT_DIR, t.path);
  const stats = getDirStats(full);
  if (stats.bytes > 0) {
    console.log(`- ${t.label.padEnd(35)}: ${formatBytes(stats.bytes)}`);
  }
}

// 3. Prisma Query Engine files breakdown
console.log("\n--- 3. PRISMA QUERY ENGINE BINARIES BREAKDOWN ---");
const prismaClientDir = path.join(ROOT_DIR, "node_modules", ".prisma", "client");
if (fs.existsSync(prismaClientDir)) {
  const files = fs.readdirSync(prismaClientDir).filter((f) => f.includes("query_engine"));
  for (const f of files) {
    const s = fs.statSync(path.join(prismaClientDir, f));
    console.log(`  ${f.padEnd(50)}: ${formatBytes(s.size)}`);
  }
}

// 4. Top 25 Largest Folders in .next
console.log("\n--- 4. TOP 25 LARGEST SUBDIRECTORIES IN .next ---");
const subdirs = getSubdirSizes(path.join(ROOT_DIR, ".next"), 3);
subdirs.slice(0, 25).forEach((d, idx) => {
  console.log(`  ${String(idx + 1).padStart(2)}. ${d.dir.padEnd(55)}: ${formatBytes(d.bytes)}`);
});

// 5. Top 40 Largest Individual Files in .next and public
console.log("\n--- 5. TOP 40 LARGEST FILES IN .next AND public ---");
const nextFiles = getAllFiles(path.join(ROOT_DIR, ".next"));
const pubFiles = getAllFiles(path.join(ROOT_DIR, "public"));
const combined = [...nextFiles, ...pubFiles].sort((a, b) => b.size - a.size);

combined.slice(0, 40).forEach((f, idx) => {
  console.log(`  ${String(idx + 1).padStart(2)}. ${f.path.padEnd(65)}: ${formatBytes(f.size)}`);
});

console.log("\n================================================================================");

