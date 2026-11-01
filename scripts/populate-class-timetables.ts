import { prisma } from "../backend/db/prisma";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

// Period schedule structure
const PERIOD_TIMES = [
  { period: 1, startTime: "08:00", endTime: "08:45", isBreak: false, slotType: "LESSON" as const },
  { period: 2, startTime: "08:45", endTime: "09:30", isBreak: false, slotType: "LESSON" as const },
  { period: 3, startTime: "09:30", endTime: "09:45", isBreak: true, slotType: "BREAK" as const },
  { period: 4, startTime: "09:45", endTime: "10:30", isBreak: false, slotType: "LESSON" as const },
  { period: 5, startTime: "10:30", endTime: "11:15", isBreak: false, slotType: "LESSON" as const },
  { period: 6, startTime: "11:15", endTime: "12:00", isBreak: false, slotType: "LESSON" as const },
];

async function main() {
  console.log("================================================================================");
  console.log("            POPULATING TIMETABLES FOR ENROLLED PARENT CLASSES                   ");
  console.log("================================================================================\n");

  const targetClasses = await prisma.class.findMany({
    where: {
      name: { in: ["Class 2", "Class 3", "Class 4"] },
      section: "A",
    },
    include: {
      subjects: {
        include: { teacher: true },
      },
      timetable: true,
    },
  });

  for (const cls of targetClasses) {
    console.log(`\nProcessing ${cls.name} - ${cls.section} (ID: ${cls.id}):`);
    console.log(`  Existing timetable records: ${cls.timetable.length}`);
    console.log(`  Available subjects: ${cls.subjects.map((s) => s.name).join(", ")}`);

    if (cls.timetable.length > 0) {
      console.log(`  Skipping: ${cls.name} already has ${cls.timetable.length} slots.`);
      continue;
    }

    const lessonSubjects = cls.subjects.filter((s) => s.name !== "BREAK");
    if (lessonSubjects.length === 0) {
      console.log(`  Error: No subjects found for ${cls.name}.`);
      continue;
    }

    const roomNumber = `Room ${cls.name.replace(/\D/g, "")}01`;
    const slotsToCreate: any[] = [];

    // Create balanced schedule across Monday through Saturday
    DAYS.forEach((day, dayIdx) => {
      let subjectPointer = dayIdx; // rotate starting subject each day

      PERIOD_TIMES.forEach((pt) => {
        if (pt.isBreak) {
          slotsToCreate.push({
            classId: cls.id,
            dayOfWeek: day,
            period: pt.period,
            startTime: pt.startTime,
            endTime: pt.endTime,
            classroom: roomNumber,
            isBreak: true,
            slotType: pt.slotType,
            status: "PUBLISHED" as const,
          });
        } else {
          const subject = lessonSubjects[subjectPointer % lessonSubjects.length];
          slotsToCreate.push({
            classId: cls.id,
            dayOfWeek: day,
            period: pt.period,
            startTime: pt.startTime,
            endTime: pt.endTime,
            classroom: roomNumber,
            isBreak: false,
            slotType: pt.slotType,
            status: "PUBLISHED" as const,
            subjectId: subject.id,
            teacherId: subject.teacherId || null,
          });
          subjectPointer++;
        }
      });
    });

    await prisma.timetable.createMany({
      data: slotsToCreate,
    });

    console.log(`  ✅ Successfully created ${slotsToCreate.length} timetable slots for ${cls.name} - ${cls.section}!`);
  }

  console.log("\n================================================================================");
  console.log(" Done populating class timetables.");
  console.log("================================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

