import { prisma } from "../backend/db/prisma";

async function main() {
  const classes = await prisma.class.findMany({
    include: {
      students: true,
      subjects: true
    }
  });
  console.log("Classes count:", classes.length);
  for (const c of classes) {
    console.log(`Class: ${c.name} - ${c.section} (ID: ${c.id}), Students: ${c.students.length}, Subjects: ${c.subjects.length}`);
    for (const s of c.students) {
      console.log(`  Student: ${s.firstName} ${s.lastName} | Roll: ${s.rollNumber} | ID: ${s.id}`);
    }
    for (const sub of c.subjects) {
      console.log(`  Subject: ${sub.name} (Max: ${sub.maxMarks}, Pass: ${sub.passMarks})`);
    }
  }

  const teachers = await prisma.teacher.findMany({
    include: {
      user: true,
      classes: true,
      classTeacherOf: true
    }
  });
  console.log("\nTeachers count:", teachers.length);
  for (const t of teachers) {
    console.log(`Teacher: ${t.user?.name} (${t.user?.email}) | Classes: ${t.classes.map(c => `${c.name}-${c.section}`).join(", ")} | ClassTeacherOf: ${t.classTeacherOf ? `${t.classTeacherOf.name}-${t.classTeacherOf.section}` : "None"}`);
  }
}

main().catch(console.error).finally(async () => {
  await prisma.$disconnect();
});

