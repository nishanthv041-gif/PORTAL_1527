import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getAuthorizedBirthdayClasses } from "@/lib/teacher/classAccess";
import { getClassMissingDobSummaryAction } from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import MissingDobStudio from "@/frontend/components/birthdays/MissingDobStudio";
import { Calendar, Users, ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ classId?: string }>;
}

export default async function TeacherMissingDobPage(props: PageProps) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const { classes, selectedClassId } = await getAuthorizedBirthdayClasses();

  if (classes.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center mb-4">
            <Users size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Class Teacher Assignment Required</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
            You are currently assigned to subject classes. Date of birth management and classroom birthday calendars are assigned to each section&apos;s designated Class Teacher.
          </p>
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 max-w-md mx-auto text-left flex items-start gap-3">
            <ShieldAlert size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <span>
              If you are the Class Teacher for a class, please ask your school administrator to link your profile as the Class Teacher for your section in <strong>Admin &gt; Classes &amp; Sections</strong>.
            </span>
          </div>
        </div>
      </div>
    );
  }

  const activeClassId = searchParams?.classId || selectedClassId || classes[0].classId;
  const summary = await getClassMissingDobSummaryAction(activeClassId);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <MissingDobStudio
        userRole={session.user.role as "ADMIN" | "TEACHER"}
        classes={classes}
        selectedClassId={activeClassId}
        initialStudents={summary.students}
        initialPercentage={summary.percentage}
        initialMissingCount={summary.missingCount}
        initialCompletedCount={summary.completedCount}
        settings={summary.settings}
      />
    </div>
  );
}

