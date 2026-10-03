import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'mounithavenkatesan@gmail.com' } });
  if (user) {
    console.log('Found user:', user);
    
    // Attempt deletion
    if (user.role === 'TEACHER') {
        await prisma.teacher.deleteMany({ where: { userId: user.id }});
    } else if (user.role === 'PARENT') {
        await prisma.parent.deleteMany({ where: { userId: user.id }});
    } else if (user.role === 'STAFF') {
        await prisma.staff.deleteMany({ where: { userId: user.id }});
    }
    
    await prisma.user.delete({ where: { id: user.id } });
    console.log('User deleted successfully.');
  } else {
    console.log('User not found.');
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
