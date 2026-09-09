import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Classes 1 to 9...');
  
  for (let i = 1; i <= 9; i++) {
    const className = `Grade ${i}`;
    
    // Check if it already exists to be safe
    const existing = await prisma.class.findFirst({
      where: { name: className }
    });
    
    if (!existing) {
      await prisma.class.create({
        data: {
          name: className,
          section: 'A',
        }
      });
      console.log(`Created ${className}`);
    }
  }
  
  console.log('Class seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
