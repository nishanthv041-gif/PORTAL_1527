import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'mounithavenkatesan@gmail.com' } });
  console.log('User found:', user);
}
main().catch(console.error).finally(() => prisma.$disconnect());
