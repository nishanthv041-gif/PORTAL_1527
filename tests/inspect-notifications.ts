import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const student = await prisma.student.findFirst({
    where: { firstName: { contains: "ANUSHKA", mode: "insensitive" } },
    include: {
      parents: {
        include: {
          parent: {
            include: { user: true }
          }
        }
      }
    }
  });
  console.log("=== ANUSHKA PARENTS ===");
  console.log(JSON.stringify(student?.parents, null, 2));

  // Check all users
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, lastLoginAt: true }
  });
  console.log("=== USERS ===");
  console.log(JSON.stringify(users, null, 2));

  // Check NotificationDeliveryLog
  const logs = await prisma.notificationDeliveryLog.findMany({
    take: 20,
    orderBy: { createdAt: "desc" }
  });
  console.log("=== DELIVERY LOGS ===");
  console.log(JSON.stringify(logs, null, 2));

  // Check all notifications in DB
  const recentNotifs = await prisma.notification.findMany({
    take: 10,
    orderBy: { createdAt: "desc" }
  });
  console.log("=== RECENT NOTIFICATIONS ===");
  console.log(JSON.stringify(recentNotifs, null, 2));
}

main().finally(() => prisma.$disconnect());
