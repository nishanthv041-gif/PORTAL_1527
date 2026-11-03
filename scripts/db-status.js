/**
 * Dual Database Reachability & Latency Checker
 * Runs `SELECT 1` on Neon (Primary) and Supabase (Secondary) and reports roundtrip latency.
 */
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');

try { process.loadEnvFile(path.join(repoRoot, '.env.local')); } catch (e) {
  try { process.loadEnvFile(path.join(repoRoot, '.env')); } catch (e2) {}
}

const { PrismaClient } = require(path.join(repoRoot, 'node_modules/@prisma/client'));

function maskUrl(urlStr) {
  if (!urlStr) return '(not set)';
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
  } catch {
    return '(valid url)';
  }
}

async function checkStatus() {
  console.log('====================================================');
  console.log('📡 DUAL DATABASE STATUS & LATENCY PROBE');
  console.log('====================================================\n');

  // 1. Primary Neon DB
  console.log('1️⃣ Probing Primary Database: Neon PostgreSQL (Singapore)...');
  console.log(`   Host: ${maskUrl(process.env.DATABASE_URL)}`);
  const neonClient = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  try {
    const t0 = performance.now();
    await Promise.race([
      neonClient.$queryRaw`SELECT 1 as ping`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 3000ms')), 3000)),
    ]);
    const neonMs = Math.round((performance.now() - t0) * 100) / 100;
    const count = await neonClient.user.count();
    console.log(`   ✅ Connected successfully! Latency: ${neonMs} ms (Active Users: ${count})\n`);
  } catch (err) {
    console.error(`   ❌ Neon Database unreachable: ${err.message}\n`);
  } finally {
    await neonClient.$disconnect();
  }

  // 2. Secondary Supabase DB
  let supaUrl =
    process.env.SUPABASE_DIRECT_URL ||
    process.env.SECONDARY_DIRECT_URL ||
    process.env.SECONDARY_DATABASE_URL ||
    process.env.SUPABASE_DATABASE_URL;

  if (supaUrl) {
    console.log('2️⃣ Probing Secondary Database: Supabase PostgreSQL (Ireland)...');
    console.log(`   Host: ${maskUrl(supaUrl)}`);
    let supaClient = new PrismaClient({
      datasources: { db: { url: supaUrl } },
    });

    try {
      const t1 = performance.now();
      await Promise.race([
        supaClient.$queryRaw`SELECT 1 as ping`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout after 3000ms')), 3000)),
      ]);
      const supaMs = Math.round((performance.now() - t1) * 100) / 100;
      const supaUsers = await supaClient.user.count();
      console.log(`   ✅ Connected successfully! Latency: ${supaMs} ms (Synced Users: ${supaUsers})\n`);
    } catch (err) {
      // Fallback probe via direct/session port 5432 if port 6543 timed out
      const fallbackUrl = process.env.SUPABASE_DIRECT_URL || process.env.SECONDARY_DIRECT_URL;
      if (fallbackUrl && fallbackUrl !== supaUrl) {
        console.log(`   ⚠️ Port 6543 timed out (${err.message.split('\n')[0]}). Trying session pooler (port 5432)...`);
        await supaClient.$disconnect();
        supaClient = new PrismaClient({
          datasources: { db: { url: fallbackUrl } },
        });
        try {
          const t2 = performance.now();
          await supaClient.$queryRaw`SELECT 1 as ping`;
          const fallbackMs = Math.round((performance.now() - t2) * 100) / 100;
          const supaUsers = await supaClient.user.count();
          console.log(`   ✅ Connected via session pooler (5432)! Latency: ${fallbackMs} ms (Synced Users: ${supaUsers})\n`);
        } catch (err2) {
          console.error(`   ❌ Supabase fallback failed: ${err2.message.split('\n')[0]}\n`);
        }
      } else {
        console.error(`   ❌ Supabase Database unreachable: ${err.message.split('\n')[0]}\n`);
      }
    } finally {
      await supaClient.$disconnect();
    }
  } else {
    console.log('⚠️ Secondary Supabase URL not configured.\n');
  }

  console.log('====================================================');
  console.log('🏁 STATUS PROBE COMPLETE');
  console.log('====================================================');
}

checkStatus().catch(console.error);
