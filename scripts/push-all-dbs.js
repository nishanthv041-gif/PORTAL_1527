/**
 * Dual Database Schema Pushing Script (Safe)
 * Applies the current Prisma schema to BOTH Neon (Primary) AND Supabase (Secondary)
 * Supports --dry-run to preview SQL differences without modifying databases.
 */
const { execSync } = require('child_process');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');

try { process.loadEnvFile(path.join(repoRoot, '.env.local')); } catch (e) {
  try { process.loadEnvFile(path.join(repoRoot, '.env')); } catch (e2) {}
}

const isDryRun = process.argv.includes('--dry-run');

console.log('====================================================');
console.log(isDryRun ? '🔍 PRISMA SCHEMA DRY-RUN DIFF (NO CHANGES)' : '🚀 PUSHING PRISMA SCHEMA TO DUAL DATABASES');
console.log('====================================================\n');

// Mask sensitive connection strings
function maskUrl(urlStr) {
  if (!urlStr) return '(not set)';
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
  } catch {
    return '(valid url)';
  }
}

// 1. Primary Neon DB
console.log('1️⃣ Target: Neon PostgreSQL (Singapore)');
console.log(`   Endpoint: ${maskUrl(process.env.DATABASE_URL)}`);

if (isDryRun) {
  try {
    console.log('   Inspecting pending migrations / schema diff for Neon...');
    const diff = execSync(
      'npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script',
      { cwd: repoRoot, env: { ...process.env }, encoding: 'utf8' }
    );
    if (!diff.trim() || diff.includes('-- This is an empty migration')) {
      console.log('   ✅ Neon schema is already in sync. No changes needed.\n');
    } else {
      console.log('   ⚠️ Pending SQL diff for Neon:\n', diff);
    }
  } catch (err) {
    console.log('   (Note on diff inspection: ' + err.message.split('\n')[0] + ')\n');
  }
} else {
  try {
    execSync('npx prisma db push --skip-generate', {
      stdio: 'inherit',
      cwd: repoRoot,
      env: { ...process.env },
    });
    console.log('   ✅ Neon PostgreSQL schema updated successfully.\n');
  } catch (neonErr) {
    console.error('   ❌ Failed to push schema to Neon:', neonErr.message);
    process.exit(1);
  }
}

// 2. Secondary Supabase DB
const supaUrl =
  process.env.SECONDARY_DIRECT_URL ||
  process.env.SECONDARY_DATABASE_URL ||
  process.env.SUPABASE_DIRECT_URL ||
  process.env.SUPABASE_DATABASE_URL;

if (supaUrl) {
  console.log('2️⃣ Target: Supabase PostgreSQL (Ireland)');
  console.log(`   Endpoint: ${maskUrl(supaUrl)}`);

  const supaEnv = {
    ...process.env,
    DATABASE_URL: supaUrl,
    DIRECT_URL: supaUrl,
  };

  if (isDryRun) {
    try {
      console.log('   Inspecting pending migrations / schema diff for Supabase...');
      const diff = execSync(
        'npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script',
        { cwd: repoRoot, env: supaEnv, encoding: 'utf8' }
      );
      if (!diff.trim() || diff.includes('-- This is an empty migration')) {
        console.log('   ✅ Supabase schema is already in sync. No changes needed.\n');
      } else {
        console.log('   ⚠️ Pending SQL diff for Supabase:\n', diff);
      }
    } catch (err) {
      console.log('   (Note on diff inspection: ' + err.message.split('\n')[0] + ')\n');
    }
  } else {
    try {
      execSync('npx prisma db push --skip-generate', {
        stdio: 'inherit',
        cwd: repoRoot,
        env: supaEnv,
      });
      console.log('   ✅ Supabase PostgreSQL schema updated successfully.\n');
    } catch (supaErr) {
      console.error('   ❌ Failed to push schema to Supabase:', supaErr.message);
      process.exit(1);
    }
  }
} else {
  console.log('⚠️ Secondary Supabase URL not configured; skipped Supabase schema step.');
}

console.log('====================================================');
console.log(isDryRun ? '🔍 DRY-RUN COMPLETE (Databases untouched).' : '🎉 DUAL DATABASE SCHEMA SYNC FINISHED SUCCESSFULLY!');
console.log('====================================================');
