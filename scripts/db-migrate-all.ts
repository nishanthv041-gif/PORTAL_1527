/**
 * Dual Database Migration Runner
 * Applies pending migrations sequentially via `prisma migrate deploy`:
 * 1. Neon PostgreSQL (Primary, Singapore) via DIRECT_URL
 * 2. Supabase PostgreSQL (Secondary, Ireland) via SECONDARY_DIRECT_URL
 *
 * Supports --dry-run to display pending migrations without applying.
 * NEVER prints passwords, tokens, or raw connection strings.
 */

import { execSync } from "child_process";
import * as path from "path";

// Load environment files safely
const repoRoot = path.resolve(__dirname, "..");
try { (process as any).loadEnvFile(path.join(repoRoot, ".env.local")); } catch {
  try { (process as any).loadEnvFile(path.join(repoRoot, ".env")); } catch {}
}

const isDryRun = process.argv.includes("--dry-run");

function maskDatabaseUrl(urlStr?: string): string {
  if (!urlStr) return "(not set)";
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
  } catch {
    return "(configured)";
  }
}

function runPrismaCommand(command: string, envOverrides: Record<string, string>): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      env: { ...process.env, ...envOverrides },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { success: true, output };
  } catch (err: any) {
    const output = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + (err.message || "");
    return { success: false, output };
  }
}

async function main() {
  console.log("==========================================================");
  console.log(`🚀 DUAL DATABASE MIGRATION ENGINE (${isDryRun ? "DRY-RUN INSPECTION" : "DEPLOY MODE"})`);
  console.log("==========================================================\n");

  // 1. Neon Primary Configuration
  const neonDirectUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!neonDirectUrl) {
    console.error("❌ ERROR: Neither DIRECT_URL nor DATABASE_URL is defined in the environment.");
    process.exit(1);
  }

  console.log(`1️⃣ Primary Database: Neon (Singapore)`);
  console.log(`   Target: ${maskDatabaseUrl(neonDirectUrl)}`);

  const neonCmd = isDryRun ? "npx prisma migrate status" : "npx prisma migrate deploy";
  console.log(`   Running: ${neonCmd}...`);
  const neonResult = runPrismaCommand(neonCmd, { DATABASE_URL: neonDirectUrl });
  console.log(neonResult.output);

  const isStatusSuccess = isDryRun 
    ? (neonResult.success || neonResult.output.includes("migrations found") || neonResult.output.includes("up to date"))
    : neonResult.success;

  if (!isStatusSuccess) {
    console.error("❌ ABORTING: Primary database migration failed. Secondary database untouched.");
    process.exit(1);
  }
  console.log("   ✅ Neon Primary status evaluated successfully.\n");

  // 2. Supabase Secondary Configuration
  const supaDirectUrl =
    process.env.SECONDARY_DIRECT_URL ||
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SECONDARY_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL;

  if (!supaDirectUrl) {
    console.warn("⚠️ WARNING: No secondary database URL configured. Skipping secondary migration.");
    console.log("==========================================================");
    console.log("🎉 MIGRATION PIPELINE COMPLETED (Primary Only)");
    console.log("==========================================================");
    return;
  }

  console.log(`2️⃣ Secondary Database: Supabase (Ireland)`);
  console.log(`   Target: ${maskDatabaseUrl(supaDirectUrl)}`);

  const supaCmd = isDryRun ? "npx prisma migrate status" : "npx prisma migrate deploy";
  console.log(`   Running: ${supaCmd}...`);
  const supaResult = runPrismaCommand(supaCmd, { DATABASE_URL: supaDirectUrl });
  console.log(supaResult.output);

  const isSupaStatusSuccess = isDryRun
    ? (supaResult.success || supaResult.output.includes("migrations found") || supaResult.output.includes("up to date"))
    : supaResult.success;

  if (!isSupaStatusSuccess) {
    console.error("⚠️ WARNING: Secondary database migration returned an error. Review output above.");
    process.exit(1);
  }
  console.log("   ✅ Supabase Secondary evaluated successfully.\n");

  console.log("==========================================================");
  console.log("🎉 ALL DATABASES SYNCHRONIZED AND UP TO DATE");
  console.log("==========================================================");
}

main().catch((err) => {
  console.error("Fatal error during migration:", err);
  process.exit(1);
});
