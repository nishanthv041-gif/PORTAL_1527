import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("Nishanth@1527", 10);
  await prisma.user.update({
    where: { email: 'nishanthv041@gmail.com' },
    data: { password: hashedPassword }
  });
  console.log("Password successfully reset for nishanthv041@gmail.com");
}

main().finally(async () => {
  await prisma.$disconnect();
});
