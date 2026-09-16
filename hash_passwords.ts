import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: ['nishanthr.ad25@bitsathy.ac.in', 'poorvika1527@gmail.com']
      }
    }
  });

  for (const user of users) {
    if (user.password && !user.password.startsWith('$2')) {
      const hashed = await bcrypt.hash(user.password, 10);
      await prisma.user.update({
        where: { email: user.email },
        data: { password: hashed }
      });
      console.log(`Updated password hash for ${user.email} (${user.role})`);
    } else {
      console.log(`Password for ${user.email} is already hashed or missing.`);
    }
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
