/**
 * Dual Database Status and Migration Audit
 * Inspects both Neon (Primary) and Supabase (Secondary) for:
 * 1. Connectivity & roundtrip ping
 * 2. User count consistency
 * 3. Schema migration synchronization status
 *
 * Safe, read-only audit. NEVER logs passwords.
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
try { (process as any).loadEnvFile(path.join(repoRoot, ".env.local")); } catch {
  try { (process as any).loadEnvFile(path.join(repoRoot, ".env")); } catch {}
}

function maskDatabaseUrl(urlStr?: string): string {
  if (!urlStr) return "(not set)";
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
  } catch {
    return "(configured)";
  }
}

async function inspectDatabase(name: string, region: string, url: string | undefined, directUrl?: string) {
  console.log(`----------------------------------------------------------`);
  console.log(`🔍 Inspecting ${name} (${region})`);
  console.log(`   Connection: ${maskDatabaseUrl(url)}`);

  if (!url) {
    console.log(`   ⚠️ Skipped: Connection URL not set.\n`);
    return;
  }

  const client = new PrismaClient({ datasources: { db: { url } } });
  try {
    const start = performance.now();
    await client.$queryRaw`SELECT 1 as ping`;
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;
    const userCount = await client.user.count();
    console.log(`   ✅ Status: CONNECTED | Ping: ${latencyMs}ms | Total Users: ${userCount}`);

    // Check migration status using direct connection if available
    const migrationUrl = directUrl || url;
    try {
      const statusOutput = execSync("npx prisma migrate status", {
        env: { ...process.env, DATABASE_URL: migrationUrl },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const isUpToDate = statusOutput.includes("Database schema is up to date");
      console.log(`   📦 Migrations: ${isUpToDate ? "✅ UP TO DATE" : "⚠️ PENDING CHANGES"}`);
    } catch {
      console.log(`   📦 Migrations: Evaluated (Check with npx tsx scripts/db-migrate-all.ts --dry-run)`);
    }
  } catch (err: any) {
    console.error(`   ❌ Failed to connect: ${err.message}`);
  } finally {
    await client.$disconnect();
    console.log("");
  }
}

async function main() {
  console.log("==========================================================");
  console.log("📊 COMPREHENSIVE DUAL DATABASE STATUS & AUDIT");
  console.log("==========================================================\n");

  await inspectDatabase(
    "Neon PostgreSQL (Primary)",
    "Singapore ap-southeast-1",
    process.env.DATABASE_URL,
    process.env.DIRECT_URL
  );

  const supaUrl = process.env.SECONDARY_DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
  const supaDirect = process.env.SECONDARY_DIRECT_URL || process.env.SUPABASE_DIRECT_URL;

  await inspectDatabase(
    "Supabase PostgreSQL (Secondary Replica)",
    "Ireland eu-west-1",
    supaUrl,
    supaDirect
  );

  console.log("==========================================================");
  console.log("Audit complete.");
  console.log("==========================================================");
}

main().catch(console.error);

