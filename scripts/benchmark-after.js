const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Load environment variables safely without external dependency
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val.trim();
    }
  });
}

async function runBenchmark() {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  console.log('====================================================');
  console.log('⚡ POST-OPTIMIZATION LATENCY BENCHMARK (LIVE NEON)');
  console.log('====================================================');

  try {
    // 1. Connection Ping
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const pingMs = Date.now() - t0;
    console.log(`📡 Neon Ping (SELECT 1): ${pingMs} ms`);

    // 2. Admin Dashboard Aggregations (Parallelized via Promise.all)
    const t1 = Date.now();
    const [totalStudents, totalTeachers, parentRecordCount, totalClasses, uniqueSubjects, classes] =
      await Promise.all([
        prisma.student.count({ where: { isActive: true } }),
        prisma.teacher.count({ where: { isActive: true } }),
        prisma.parent.count({ where: { isActive: true } }),
        prisma.class.count({ where: { isActive: true } }),
        prisma.subject.findMany({ distinct: ['name'], select: { name: true } }),
        prisma.class.findMany({
          where: { isActive: true },
          select: { id: true, name: true, section: true },
          orderBy: [{ name: 'asc' }, { section: 'asc' }],
        }),
      ]);
    const adminMs = Date.now() - t1;
    console.log(`📊 Admin Dashboard Queries (Parallel): ${adminMs} ms`);

    // 3. Admin Students & Classes (Parallelized + Field-pruned)
    const t2 = Date.now();
    const [students, classList] = await Promise.all([
      prisma.student.findMany({
        orderBy: { firstName: 'asc' },
        select: {
          id: true,
          rollNumber: true,
          firstName: true,
          lastName: true,
          isActive: true,
          classId: true,
        },
      }),
      prisma.class.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          section: true,
        },
      }),
    ]);
    const studentsMs = Date.now() - t2;
    console.log(`👨‍🎓 Admin Students & Classes (Parallel): ${studentsMs} ms`);

    // 4. Admin Classes & Teachers (Parallelized + Selective attendance)
    const t3 = Date.now();
    const [classesWithRel, teachers] = await Promise.all([
      prisma.class.findMany({
        where: { isActive: true },
        include: {
          teacher: { include: { user: true } },
          students: {
            where: { isActive: true },
            include: {
              attendances: {
                select: { id: true, status: true, studentId: true, classId: true },
              },
            },
          },
        },
      }),
      prisma.teacher.findMany({
        where: { isActive: true },
        include: { user: true },
      }),
    ]);
    const classesMs = Date.now() - t3;
    console.log(`🏫 Admin Classes & Teachers (Parallel + Pruned): ${classesMs} ms`);

    // 5. Outbox Queue Health
    const t4 = Date.now();
    const outboxPending = await prisma.syncOutbox.count({ where: { status: 'PENDING' } });
    const outboxMs = Date.now() - t4;
    console.log(`📦 SyncOutbox Queue Check: ${outboxMs} ms (Pending items: ${outboxPending})`);

    console.log('\n====================================================');
    console.log('📈 SUMMARY OF MEASUREMENTS');
    console.log('====================================================');
    console.log(`• Admin Dashboard: ${adminMs} ms (Baseline: 876 ms)`);
    console.log(`• Students & Classes: ${studentsMs} ms (Baseline: 1,336 ms)`);
    console.log(`• Classes & Teachers: ${classesMs} ms (Baseline: 1,480 ms)`);
    console.log('====================================================');
  } catch (err) {
    console.error('Benchmark error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runBenchmark();
