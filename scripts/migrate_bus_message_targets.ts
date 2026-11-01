import { prisma } from "../backend/db/prisma";

async function main() {
  console.log("Migrating existing BusMessage records with single targetStudentId to BusMessageTarget join table...");

  const oldMessages = await prisma.busMessage.findMany({
    where: {
      targetStudentId: { not: null },
    },
  });

  console.log(`Found ${oldMessages.length} messages with single targetStudentId.`);

  let migratedCount = 0;
  for (const msg of oldMessages) {
    if (!msg.targetStudentId) continue;

    await prisma.busMessageTarget.upsert({
      where: {
        busMessageId_studentId: {
          busMessageId: msg.id,
          studentId: msg.targetStudentId,
        },
      },
      create: {
        busMessageId: msg.id,
        studentId: msg.targetStudentId,
      },
      update: {},
    });
    migratedCount++;
  }

  console.log(`Successfully migrated ${migratedCount} target relations.`);
}

main()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

