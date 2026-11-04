import { prisma } from "../backend/db/prisma";

async function main() {
  const classes = await prisma.class.findMany({
    select: { id: true, name: true, section: true, teacherId: true },
    orderBy: [{ name: "asc" }, { section: "asc" }]
  });
  console.log("Total classes in database:", classes.length);
  console.log(JSON.stringify(classes, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
