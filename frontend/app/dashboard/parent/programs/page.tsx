import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ProgramsParentClient from "./ProgramsParentClient";

import { redirect } from "next/navigation";

export default async function ParentProgramsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) {
    redirect("/login");
  }
  if (session.user.role.toUpperCase() !== "PARENT") {
    redirect("/dashboard");
  }

  // Parents view published school programs
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
          View upcoming and past school events, functions, ceremonies, and programs.
        </p>
      </div>

      <ProgramsParentClient programs={programs} />
    </div>
  );
}
