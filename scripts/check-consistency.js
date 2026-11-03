/**
 * Dual Database Consistency Checker
 * Compares row counts between Neon (Primary) and Supabase (Secondary) across all main models.
 * Strictly no private data printed.
 */
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');

try { process.loadEnvFile(path.join(repoRoot, '.env.local')); } catch (e) {
  try { process.loadEnvFile(path.join(repoRoot, '.env')); } catch (e2) {}
}

const { PrismaClient } = require(path.join(repoRoot, 'node_modules/@prisma/client'));

const neonPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const supaUrl =
  process.env.SUPABASE_DIRECT_URL ||
  process.env.SECONDARY_DIRECT_URL ||
  process.env.SECONDARY_DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL;

const supaPrisma = new PrismaClient({
  datasources: { db: { url: supaUrl } },
});

const CHECK_MODELS = [
  'user',
  'userSession',
  'teacher',
  'staff',
  'parent',
  'academicBatch',
  'class',
  'student',
  'subject',
  'timetable',
  'teacherAttendance',
  'substitution',
  'exam',
  'mark',
  'attendance',
  'message',
  'notification',
  'bus',
  'reportCard',
  'auditLog',
];

async function checkConsistency() {
  console.log('====================================================');
  console.log('⚖️ DUAL DATABASE CONSISTENCY & ROW COUNT COMPARISON');
  console.log('====================================================\n');

  let matchCount = 0;
  let mismatchCount = 0;

  for (const model of CHECK_MODELS) {
    try {
      const neonCount = await neonPrisma[model].count();
      const supaCount = await supaPrisma[model].count();
      const isMatch = neonCount === supaCount;

      if (isMatch) {
        console.log(`✅ [${model.padEnd(18)}] Neon: ${String(neonCount).padStart(4)} | Supabase: ${String(supaCount).padStart(4)} (In Sync)`);
        matchCount++;
      } else {
        console.warn(`⚠️ [${model.padEnd(18)}] Neon: ${String(neonCount).padStart(4)} | Supabase: ${String(supaCount).padStart(4)} (MISMATCH)`);
        mismatchCount++;
      }
    } catch (err) {
      console.error(`❌ [${model.padEnd(18)}] Error comparing: ${err.message.split('\n')[0]}`);
      mismatchCount++;
    }
  }

  console.log('\n====================================================');
  if (mismatchCount === 0) {
    console.log(`🎉 100% CONSISTENT: All ${matchCount} checked models have matching row counts!`);
  } else {
    console.log(`⚠️ MISMATCH DETECTED: ${mismatchCount} models differ. Run 'npm run db:sync' to reconcile.`);
  }
  console.log('====================================================');
}

checkConsistency()
  .catch(console.error)
  .finally(async () => {
    await neonPrisma.$disconnect();
    await supaPrisma.$disconnect();
  });
