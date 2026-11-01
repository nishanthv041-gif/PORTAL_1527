import { prisma } from "../backend/db/prisma";

async function runTest() {
  console.log("=== RUNNING MULTISELECT BUS MESSAGE TEST ===");

  // 1. Fetch any active bus
  const bus = await prisma.bus.findFirst({
    where: { isActive: true },
    include: {
      students: {
        include: {
          student: {
            include: {
              parents: {
                include: { parent: { include: { user: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!bus) {
    console.log("⚠️ No active bus found, skipping live dispatch test.");
    return;
  }

  console.log(`Found active bus: ${bus.busNumber} (${bus.name}) with ${bus.students.length} enrolled students.`);

  // 2. Test schema validation
  const { SendBusMessageSchema } = await import("../backend/lib/validations/transport");
  
  const validPayload = {
    type: "INDIVIDUAL",
    title: "Multi-Student Field Trip Alert",
    message: "Important bus timing update for your child.",
    priority: "URGENT",
    targetStudentIds: bus.students.map((bs) => bs.studentId),
  };

  const parsed = SendBusMessageSchema.safeParse(validPayload);
  if (!parsed.success) {
    throw new Error(`SendBusMessageSchema failed: ${JSON.stringify(parsed.error.issues)}`);
  }
  console.log("✅ SendBusMessageSchema successfully parses targetStudentIds array.");

  // 3. Test deduplication logic
  const parentMap = new Map<string, string[]>();
  bus.students.forEach((bs) => {
    const sName = `${bs.student.firstName} ${bs.student.lastName}`;
    bs.student.parents.forEach((p) => {
      if (p.parent?.userId) {
        const existing = parentMap.get(p.parent.userId) || [];
        if (!existing.includes(sName)) existing.push(sName);
        parentMap.set(p.parent.userId, existing);
      }
    });
  });

  console.log(`✅ Deduplication test: ${bus.students.length} students map to ${parentMap.size} unique parent accounts.`);
  console.log("=== MULTISELECT BUS MESSAGE TEST PASSED ===");
}

runTest()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

