import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const students = await prisma.student.findMany({
    where: { dateOfBirth: { not: null } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      rollNumber: true,
      class: { select: { id: true, name: true, section: true } },
      parents: {
        include: {
          parent: {
            include: {
              user: { select: { id: true, email: true, name: true, status: true } },
            },
          },
        },
      },
    },
  });
  console.log("Students with DOB:", JSON.stringify(students, null, 2));

  const settings = await prisma.birthdaySettings.findUnique({
    where: { id: "default" },
  });
  console.log("Current BirthdaySettings in DB:", settings);

  const notifs = await prisma.notification.findMany({
    where: {
      OR: [
        { category: "BIRTHDAY" },
        { type: "BIRTHDAY" },
        { title: { contains: "Birthday", mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      title: true,
      content: true,
      user: { select: { email: true, name: true, role: true } },
    },
  });
  console.log("Recent Birthday Notifications:", JSON.stringify(notifs, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);

