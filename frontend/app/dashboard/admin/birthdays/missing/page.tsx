import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import {
  getMissingDobSummaryAction,
  getClassMissingDobSummaryAction,
  getAdminDobChangesLogAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { getAuthorizedBirthdayClasses } from "@/lib/teacher/classAccess";
import MissingDobClient from "./MissingDobClient";
import MissingDobStudio from "@/frontend/components/birthdays/MissingDobStudio";
import Link from "next/link";
import { Calendar, Users, UserCheck } from "lucide-react";
import styles from "@/frontend/components/birthdays/BirthdayStudio.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ view?: string; classId?: string }>;
}

export default async function AdminMissingDobPage(props: PageProps) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const viewMode = searchParams.view || "all"; // 'all' or 'class'

  const [summary, authClasses, dbClasses, adminLogsData] = await Promise.all([
    getMissingDobSummaryAction(),
    getAuthorizedBirthdayClasses(),
    prisma.class.findMany({
      select: { id: true, name: true, section: true },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    }),
    getAdminDobChangesLogAction({ limit: 50 }),
  ]);

  const activeClassId =
    searchParams.classId ||
    authClasses.selectedClassId ||
    authClasses.classes[0]?.classId ||
    dbClasses[0]?.id ||
    "";

  let classSummary = null;
  if (activeClassId) {
    try {
      classSummary = await getClassMissingDobSummaryAction(activeClassId);
    } catch {}
  }

  return (
    <div className={styles.adminPageWrapper}>
      {/* Top Switcher Navigation */}
      <div className={styles.adminHubNav}>
        <div>
          <h2 className={styles.adminHubTitle}>
            <Calendar size={22} style={{ color: "#f59e0b" }} />
            <span>Date of Birth Records Registry</span>
          </h2>
          <p className={styles.adminHubSubtitle}>
            Manage student and staff birth dates across the entire school or section-by-section.
          </p>
        </div>

        <div className={styles.adminSegmentControl}>
          <Link
            href="/dashboard/admin/birthdays/missing?view=all"
            className={`${styles.adminSegmentBtn} ${viewMode === "all" ? styles.adminSegmentBtnActive : ""}`}
          >
            <Users size={14} />
            <span>All School Roles</span>
          </Link>
          <Link
            href="/dashboard/admin/birthdays/missing?view=class"
            className={`${styles.adminSegmentBtn} ${viewMode === "class" ? styles.adminSegmentBtnActive : ""}`}
          >
            <UserCheck size={14} />
            <span>Classroom Studio</span>
          </Link>
        </div>
      </div>

      {viewMode === "class" && classSummary ? (
        <MissingDobStudio
          userRole="ADMIN"
          classes={authClasses.classes}
          selectedClassId={activeClassId}
          initialStudents={classSummary.students}
          initialPercentage={classSummary.percentage}
          initialMissingCount={classSummary.missingCount}
          initialCompletedCount={classSummary.completedCount}
          settings={classSummary.settings}
          adminLogs={adminLogsData.logs}
        />
      ) : (
        <MissingDobClient initialData={summary} classes={dbClasses} />
      )}
    </div>
  );
}
