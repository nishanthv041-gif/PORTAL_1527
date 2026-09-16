import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("ALL USERS:", users.map(u => ({ email: u.email, role: u.role })));
  
  const u = await prisma.user.findUnique({ where: { email: 'nishanthv041@gmail.com' } });
  if (u) {
    const {password, ...rest} = u;
    console.log("TARGET USER:", rest);
  } else {
    console.log("TARGET USER NOT FOUND");
  }
}

main().finally(async () => {
  await prisma.$disconnect();
});
