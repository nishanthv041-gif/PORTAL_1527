/**
 * Dual Database Schema Pushing Script
 * Applies the current Prisma schema to BOTH Neon (Primary) AND Supabase (Secondary)
 */
const { execSync } = require('child_process');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');

try { process.loadEnvFile(path.join(repoRoot, '.env.local')); } catch (e) {
  try { process.loadEnvFile(path.join(repoRoot, '.env')); } catch (e2) {}
}

console.log('====================================================');
console.log('🚀 PUSHING PRISMA SCHEMA TO DUAL DATABASES');
console.log('====================================================\n');

// 1. Primary Neon DB
console.log('1️⃣ Updating Primary Database: Neon PostgreSQL...');
try {
  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    cwd: repoRoot,
    env: { ...process.env },
  });
  console.log('✅ Neon PostgreSQL schema is up to date.\n');
} catch (neonErr) {
  console.error('❌ Failed to push schema to Neon:', neonErr.message);
  process.exit(1);
}

// 2. Secondary Supabase DB
const supaUrl = process.env.SUPABASE_DIRECT_URL || process.env.SUPABASE_DATABASE_URL;
if (supaUrl) {
  console.log('2️⃣ Updating Secondary Database: Supabase PostgreSQL...');
  try {
    execSync('npx prisma db push --skip-generate', {
      stdio: 'inherit',
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: supaUrl,
        DIRECT_URL: supaUrl,
      },
    });
    console.log('✅ Supabase PostgreSQL schema is up to date.\n');
  } catch (supaErr) {
    console.error('❌ Failed to push schema to Supabase:', supaErr.message);
    process.exit(1);
  }
} else {
  console.log('⚠️ SUPABASE_DATABASE_URL / SUPABASE_DIRECT_URL not found; skipped Supabase schema push.');
}

console.log('====================================================');
console.log('🎉 DUAL DATABASE SCHEMA SYNC FINISHED SUCCESSFULLY!');
console.log('====================================================');
