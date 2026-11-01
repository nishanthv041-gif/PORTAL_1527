import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- SRT PORTAL INITIALIZATION SEED ---');

  // Startup Guard 1: Refuse to run in production
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ Seed aborted: NODE_ENV is set to production. Seed cannot run against production.');
    return;
  }

  // Startup Guard 2: Refuse to run if real students already exist in database
  const studentCount = await prisma.student.count();
  if (studentCount > 0) {
    console.warn(`⚠️ Seed aborted: Database already contains ${studentCount} students. Seed will not overwrite or inject records into an active database.`);
    return;
  }

  // Ensure an initial system admin user exists if database is completely empty
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });

  if (!existingAdmin) {
    console.log('No administrator account found. Provisioning primary system admin...');
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    await prisma.user.create({
      data: {
        email: 'admin@srt.edu',
        password: hashedPassword,
        name: 'System Administrator',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log('✅ Initial admin created (admin@srt.edu).');
  } else {
    console.log(`Administrator account already exists (${existingAdmin.email}).`);
  }

  console.log('✅ System seed finished cleanly. No demo or sample records created.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
