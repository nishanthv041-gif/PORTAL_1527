import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import CreateTeacherClient from "./CreateTeacherClient";

export default async function AdminCreateTeacherPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const [subjects, classes] = await Promise.all([
    prisma.subject.findMany({
      where: { isActive: true, teacherId: null },
      include: { class: true },
      orderBy: [{ class: { name: 'asc' } }, { name: 'asc' }]
    }),
    prisma.class.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { section: 'asc' }]
    })
  ]);

  return <CreateTeacherClient subjects={subjects} classes={classes} />;
}
