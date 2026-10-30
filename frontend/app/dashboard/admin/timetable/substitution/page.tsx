import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import {
  getSubstitutionDataForDateAction,
  getAbsentTeacherPeriodsAction
} from "@/backend/api/actions/dashboard/admin/substitution/substitutionActions";
import SubstitutionClient from "./SubstitutionClient";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatSchoolDate } from "@/backend/lib/timetable/getEffectiveTimetable";

export default async function AdminSubstitutionPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; teacherId?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedParams = await searchParams;
  const todayStr = new Date().toISOString().split("T")[0];
  const dateStr = resolvedParams.date || todayStr;
  const initialTeacherId = resolvedParams.teacherId || "";

  const [subData, teachers] = await Promise.all([
    getSubstitutionDataForDateAction(dateStr),
    prisma.teacher.findMany({
      include: { user: true, subjects: true },
      orderBy: { user: { name: "asc" } }
    })
  ]);

  let initialTeacherPeriods: any = null;
  if (initialTeacherId) {
    initialTeacherPeriods = await getAbsentTeacherPeriodsAction(initialTeacherId, dateStr);
  }

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          href="/dashboard/admin/timetable"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "var(--primary)",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: 500
          }}
        >
          <ArrowLeft size={16} /> Back to Timetable Management
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0 }}>Substitution &amp; Duty Management</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", marginBottom: 0, fontSize: "0.9rem" }}>
            Pick absent teachers, select periods, and assign available substitutes in one click.
          </p>
        </div>
      </div>

      <SubstitutionClient
        initialDate={dateStr}
        initialTeacherId={initialTeacherId}
        initialData={subData}
        initialTeacherPeriods={initialTeacherPeriods}
        allTeachers={teachers.map(t => ({
          id: t.id,
          name: t.user.name || "Teacher",
          email: t.user.email || undefined,
          subjects: t.subjects.map(s => s.name)
        }))}
      />
    </div>
  );
}
