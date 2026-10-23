import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ProgramsTeacherClient from "./ProgramsTeacherClient";
import { redirect } from "next/navigation";

export default async function TeacherProgramsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) {
    redirect("/login");
  }
  if (session.user.role.toUpperCase() !== "TEACHER") {
    redirect("/dashboard");
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classes: {
        select: { id: true, name: true, section: true }
      }
    }
  });

  // Teachers view published school programs
  const programs = await prisma.calendarEvent.findMany({
    where: { 
      type: "PROGRAM",
      isPublished: true 
    },
    orderBy: { date: "asc" }
  });

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 className={styles.title} style={{ margin: 0, marginBottom: "0.5rem" }}>School Programs</h1>
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>
          View school programs, ceremonies, functions, and events targeted to your classes or school-wide.
        </p>
      </div>

      <ProgramsTeacherClient 
        programs={programs} 
        teacherClasses={teacher?.classes || []} 
      />
    </div>
  );
}
