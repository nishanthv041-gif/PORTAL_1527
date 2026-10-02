import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.mark.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.parentStudent.deleteMany();
  await prisma.student.deleteMany();
  await prisma.parent.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.user.deleteMany();
  await prisma.class.deleteMany();
  
  console.log('Seeding Database...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create Admin User
  await prisma.user.create({
    data: {
      email: 'nishanthv041@gmail.com',
      password: hashedPassword,
      name: 'System Admin',
      role: 'ADMIN',
    },
  });

  // Create Teachers
  const teacherUser1 = await prisma.user.create({
    data: {
      email: 'teacher1@portal.com',
      password: hashedPassword,
      name: 'John Smith',
      role: 'TEACHER',
    },
  });

  const teacher1 = await prisma.teacher.create({
    data: {
      userId: teacherUser1.id,
      qualification: 'M.Sc Mathematics',
      joinDate: new Date('2020-01-15'),
    },
  });

  // Create Classes
  const class1 = await prisma.class.create({
    data: {
      name: 'Grade 10',
      section: 'A',
      teacherId: teacher1.id,
    },
  });

  // Create Parents
  const parentUser1 = await prisma.user.create({
    data: {
      email: 'parent1@portal.com',
      password: hashedPassword,
      name: 'Mary Johnson',
      role: 'PARENT',
    },
  });

  const parent1 = await prisma.parent.create({
    data: {
      userId: parentUser1.id,
      occupation: 'Engineer',
    },
  });

  // Create Students
  const student1 = await prisma.student.create({
    data: {
      rollNumber: 'R1001',
      admissionNo: 'A2023001',
      firstName: 'Michael',
      lastName: 'Johnson',
      classId: class1.id,
    },
  });

  // Link Parent & Student
  await prisma.parentStudent.create({
    data: {
      parentId: parent1.id,
      studentId: student1.id,
    },
  });
  
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
