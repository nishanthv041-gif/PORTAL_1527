/**
 * Dual Database Synchronizer: Neon (Primary) -> Supabase (Secondary)
 * Safely copies all existing records from Neon to Supabase in topological dependency order.
 */
const path = require('path');
const repoRoot = path.resolve(__dirname, '..');

try { process.loadEnvFile(path.join(repoRoot, '.env.local')); } catch (e) {
  try { process.loadEnvFile(path.join(repoRoot, '.env')); } catch (e2) {}
}

const { PrismaClient } = require(path.join(repoRoot, 'node_modules/@prisma/client'));

const neonPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } }
});

const supaUrl = process.env.SUPABASE_DIRECT_URL || process.env.SUPABASE_DATABASE_URL;
if (!supaUrl) {
  console.error('Error: SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL is not set.');
  process.exit(1);
}

const supaPrisma = new PrismaClient({
  datasources: { db: { url: supaUrl } }
});

// Dependency-ordered models to avoid foreign key violations
const SYNC_MODELS = [
  'user',
  'userSession',
  'teacher',
  'staff',
  'parent',
  'academicBatch',
  'class',
  'student',
  'parentStudent',
  'subject',
  'timetable',
  'teacherAttendance',
  'teacherAbsence',
  'substitution',
  'examRequest',
  'examRequestSubject',
  'exam',
  'examSubject',
  'mark',
  'attendance',
  'calendarEvent',
  'announcement',
  'message',
  'notification',
  'bus',
  'busStudent',
  'busStatusLog',
  'busMessage',
  'busMessageTarget',
  'meeting',
  'complaint',
  'complaintMessage',
  'assignment',
  'homeworkComment',
  'achievement',
  'disciplineRecord',
  'leaveRequest',
  'reportCard',
  'auditLog',
  'rating',
];

async function syncAll() {
  console.log('====================================================');
  console.log('🔄 STARTING NEON -> SUPABASE DATA SYNCHRONIZATION');
  console.log('Source: Neon PostgreSQL (Primary)');
  console.log('Target: Supabase PostgreSQL (Secondary)');
  console.log('====================================================\n');

  let totalSynced = 0;

  for (const model of SYNC_MODELS) {
    if (!neonPrisma[model] || !supaPrisma[model]) {
      continue;
    }

    try {
      const records = await neonPrisma[model].findMany();
      if (records.length === 0) {
        continue;
      }

      console.log(`⏳ Syncing ${records.length} records for model: "${model}"...`);

      // Upsert or insert records into Supabase in chunks
      let syncedForModel = 0;
      for (const record of records) {
        try {
          if (model === 'parentStudent') {
            await supaPrisma.parentStudent.upsert({
              where: {
                parentId_studentId: {
                  parentId: record.parentId,
                  studentId: record.studentId,
                },
              },
              update: record,
              create: record,
            });
          } else if (record.id) {
            await supaPrisma[model].upsert({
              where: { id: record.id },
              update: record,
              create: record,
            });
          } else {
            // Models without standard id
            await supaPrisma[model].create({ data: record });
          }
          syncedForModel++;
        } catch (itemErr) {
          // If already exists or minor duplicate key, ignore
          console.warn(`  ⚠️ Record in ${model} (id: ${record.id}): ${itemErr.message.split('\n')[0]}`);
        }
      }

      console.log(`✅ [${model}] Successfully synced ${syncedForModel}/${records.length} records to Supabase.`);
      totalSynced += syncedForModel;
    } catch (modelErr) {
      console.error(`❌ Error syncing model ${model}:`, modelErr.message.split('\n')[0]);
    }
  }

  console.log('\n====================================================');
  console.log(`🎉 SYNCHRONIZATION COMPLETE: Total ${totalSynced} records synced to Supabase!`);
  console.log('====================================================');
}

syncAll()
  .catch(console.error)
  .finally(async () => {
    await neonPrisma.$disconnect();
    await supaPrisma.$disconnect();
  });

