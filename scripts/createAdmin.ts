import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up old admins and login attempts...");
  
  // Delete all login attempts
  await prisma.loginAttempt.deleteMany({});
  
  // Delete all users with role ADMIN
  await prisma.user.deleteMany({
    where: {
      role: 'ADMIN'
    }
  });

  console.log("Creating new admin account...");
  
  const hashedPassword = await bcrypt.hash("Nishanth@2715", 10);
  
  const admin = await prisma.user.create({
    data: {
      name: "Admin Nishanth",
      email: "[EMAIL_ADDRESS]",
      password: hashedPassword,
      role: "ADMIN",
      status: "ACTIVE"
    }
  });

  console.log("Admin created successfully:", admin.email);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
