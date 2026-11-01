import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding / Syncing SRT School Transport Data...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Ensure Dedicated Transport Staff In-Charge User & Profile
  const staffUser = await prisma.user.upsert({
    where: { email: 'transport@portal.com' },
    update: {
      name: 'Karthik Raja',
      role: 'STAFF',
      status: 'ACTIVE',
    },
    create: {
      email: 'transport@portal.com',
      password: hashedPassword,
      name: 'Karthik Raja',
      role: 'STAFF',
      status: 'ACTIVE',
    },
  });

  const staff = await prisma.staff.upsert({
    where: { userId: staffUser.id },
    update: {
      phone: '+91 98401 23456',
      designation: 'Transport In-charge & Fleet Supervisor',
      isActive: true,
    },
    create: {
      userId: staffUser.id,
      phone: '+91 98401 23456',
      designation: 'Transport In-charge & Fleet Supervisor',
      isActive: true,
      joinDate: new Date('2021-06-01'),
    },
  });

  // Also ensure existing teachers have Staff profiles so they can be assigned as bus in-charge
  const teachers = await prisma.teacher.findMany({ include: { user: true } });
  for (const t of teachers) {
    await prisma.staff.upsert({
      where: { userId: t.userId },
      update: {
        phone: t.phone,
        designation: 'Teacher & Bus In-charge',
        isActive: true,
      },
      create: {
        userId: t.userId,
        phone: t.phone,
        designation: 'Teacher & Bus In-charge',
        isActive: true,
        joinDate: new Date(),
      },
    });
  }

  // 2. Seed 2 Sample Buses with School-Appropriate Names
  const bus1 = await prisma.bus.upsert({
    where: { busNumber: 'BUS-01' },
    update: {
      name: 'SRT Bus 01 - North Campus Route',
      registrationNo: 'TN-01-AB-1234',
      capacity: 40,
      driverName: 'Ramesh Kumar',
      driverPhone: '+91 98765 43210',
      routeDescription: 'North Zone - Anna Nagar - Guindy - School Campus',
      status: 'RUNNING',
      inChargeStaffId: staff.id,
      isActive: true,
    },
    create: {
      busNumber: 'BUS-01',
      name: 'SRT Bus 01 - North Campus Route',
      registrationNo: 'TN-01-AB-1234',
      capacity: 40,
      driverName: 'Ramesh Kumar',
      driverPhone: '+91 98765 43210',
      routeDescription: 'North Zone - Anna Nagar - Guindy - School Campus',
      status: 'RUNNING',
      inChargeStaffId: staff.id,
      isActive: true,
    },
  });

  const bus2 = await prisma.bus.upsert({
    where: { busNumber: 'BUS-02' },
    update: {
      name: 'SRT Bus 02 - Central Zone Express',
      registrationNo: 'TN-01-CD-5678',
      capacity: 35,
      driverName: 'Suresh Babu',
      driverPhone: '+91 98765 12345',
      routeDescription: 'Central Station - T Nagar - Adyar - School Campus',
      status: 'RUNNING',
      inChargeStaffId: staff.id,
      isActive: true,
    },
    create: {
      busNumber: 'BUS-02',
      name: 'SRT Bus 02 - Central Zone Express',
      registrationNo: 'TN-01-CD-5678',
      capacity: 35,
      driverName: 'Suresh Babu',
      driverPhone: '+91 98765 12345',
      routeDescription: 'Central Station - T Nagar - Adyar - School Campus',
      status: 'RUNNING',
      inChargeStaffId: staff.id,
      isActive: true,
    },
  });

  // 3. Assign an active student if available
  const existingStudent = await prisma.student.findFirst({
    where: { isActive: true },
  });

  if (existingStudent) {
    await prisma.busStudent.upsert({
      where: {
        studentId_academicYear: {
          studentId: existingStudent.id,
          academicYear: '2025-2026',
        },
      },
      update: {
        busId: bus1.id,
        pickupPoint: 'Anna Nagar West Gate (07:30 AM)',
        dropPoint: 'Anna Nagar West Gate (04:30 PM)',
      },
      create: {
        busId: bus1.id,
        studentId: existingStudent.id,
        academicYear: '2025-2026',
        pickupPoint: 'Anna Nagar West Gate (07:30 AM)',
        dropPoint: 'Anna Nagar West Gate (04:30 PM)',
      },
    });
  }

  // 4. Initial Status Log for Bus 1 if none exists
  const existingLog = await prisma.busStatusLog.findFirst({
    where: { busId: bus1.id },
  });
  if (!existingLog) {
    await prisma.busStatusLog.create({
      data: {
        busId: bus1.id,
        status: 'RUNNING',
        issueType: null,
        description: 'Daily morning and evening school transit operating normally.',
        reportedByStaffId: staff.id,
      },
    });
  }

  console.log('Transport seed synced cleanly: 2 sample buses, staff in-charge, and student assignment!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
