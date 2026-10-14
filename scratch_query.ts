import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const emails = [
    'vvijayasri659@gmail.com',
    'ninduja05@gmail.com',
    'giribalanma.ad24@bitsathy.ac.in'
  ];

  for (const email of emails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      console.log('Found user:', user.email, 'Role:', user.role);
      
      // Attempt deletion
      if (user.role === 'TEACHER') {
          await prisma.teacher.deleteMany({ where: { userId: user.id }});
      } else if (user.role === 'PARENT') {
          await prisma.parent.deleteMany({ where: { userId: user.id }});
      } else if (user.role === 'STAFF') {
          await prisma.staff.deleteMany({ where: { userId: user.id }});
      }
      
      await prisma.user.delete({ where: { id: user.id } });
      console.log(`User ${email} deleted successfully.`);
    } else {
      console.log(`User ${email} not found.`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
