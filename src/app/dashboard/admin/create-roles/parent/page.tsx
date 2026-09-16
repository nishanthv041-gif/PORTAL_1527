import { prisma } from "@/backend/db/prisma";
import ParentStudentWizard from "./ParentStudentWizard";

export default async function CreateParentPage() {
  const classes = await prisma.class.findMany({
    where: { isActive: true },
    select: { id: true, name: true, section: true },
    orderBy: [{ name: 'asc' }, { section: 'asc' }]
  });

  return <ParentStudentWizard classes={classes} />;
}
