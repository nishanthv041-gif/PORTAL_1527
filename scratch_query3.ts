import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
  console.log('All Users:', users);
}
main().catch(console.error).finally(() => prisma.$disconnect());
