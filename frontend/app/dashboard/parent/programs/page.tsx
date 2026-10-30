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
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 className={styles.title} style={{ margin: 0 }}>School Programs</h1>
      </div>

      <ProgramsParentClient programs={programs} />
    </div>
  );
}
