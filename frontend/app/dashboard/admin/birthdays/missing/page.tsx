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
import { Sparkles, Users, UserCheck } from "lucide-react";

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Switcher Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles size={20} className="text-amber-500" />
            <span>Date of Birth Completion Hub</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Switch between whole-school staff &amp; student roles or class-by-class teacher views.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Link
            href="/dashboard/admin/birthdays/missing?view=all"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === "all"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Users size={14} />
            <span>All School Roles</span>
          </Link>
          <Link
            href="/dashboard/admin/birthdays/missing?view=class"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === "class"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
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
