import fs from "fs";
import path from "path";

// Allowed exceptions (e.g. comment or test template files)
const IGNORED_PATHS = [
  "tests",
  "node_modules",
  ".next",
  ".git",
  "scratch",
  "backups",
  "scripts/generate-templates.ts", // template generator for Excel/CSV import headers
  "scripts/remove-demo-data.ts",    // cleanup script that explicitly targets demo records
];

// Patterns that flag prohibited fake/demo data
const FORBIDDEN_PATTERNS = [
  { name: "Demo Student Aarav", regex: /\bAarav\b/ },
  { name: "Demo Student Diya", regex: /\bDiya\b/ },
  { name: "Demo Lastname Patel", regex: /\bPatel\b/ },
  { name: "Demo Roll 501", regex: /["']501["']/ },
  { name: "Demo Roll 502", regex: /["']502["']/ },
  { name: "Hardcoded Main Gate default", regex: /"Main Gate \(07:30 AM\)"/ },
  { name: "Hardcoded Main Gate drop", regex: /"Main Gate \(04:15 PM\)"/ },
  { name: "Fallback Subject ID", regex: /["']fallback-(tamil|maths|english|science|social)["']/ },
];

function scanDirectory(dir: string, violations: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, "/");

    if (IGNORED_PATHS.some((p) => relPath === p || relPath.startsWith(p + "/"))) {
      continue;
    }

    if (entry.isDirectory()) {
      scanDirectory(fullPath, violations);
    } else if (entry.isFile() && /\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push(`[${pattern.name}] found in ${relPath}`);
        }
      }
    }
  }
}

async function runNoMockDataTest() {
  console.log("=== RUNNING NO-MOCK-DATA COMPLIANCE TEST ===");
  const violations: string[] = [];

  scanDirectory(path.join(process.cwd(), "frontend"), violations);
  scanDirectory(path.join(process.cwd(), "backend"), violations);
  scanDirectory(path.join(process.cwd(), "app"), violations);
  scanDirectory(path.join(process.cwd(), "prisma"), violations);

  if (violations.length > 0) {
    console.error("❌ FAILING: Found prohibited mock/demo references in codebase:");
    violations.forEach((v) => console.error("   - " + v));
    process.exit(1);
  }

  console.log("✅ PASS: Codebase contains zero prohibited mock/demo data arrays or references!");
}

runNoMockDataTest();

