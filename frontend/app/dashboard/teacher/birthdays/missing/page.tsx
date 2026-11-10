import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getAuthorizedBirthdayClasses } from "@/lib/teacher/classAccess";
import { getClassMissingDobSummaryAction } from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { getTeacherPendingClassRequestsAction } from "@/backend/api/actions/dashboard/teacher/classTeacherRequestActions";
import MissingDobStudio from "@/frontend/components/birthdays/MissingDobStudio";
import WaitingForAccessCard from "@/frontend/components/birthdays/WaitingForAccessCard";

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
  const {
    classes,
    allTaughtClasses,
    selectedClassId,
    canEditDob,
    canViewBirthdays,
  } = await getAuthorizedBirthdayClasses();

  // If teacher is not allowed to edit DOB (e.g. subject teacher with Switch B OFF, or unassigned teacher)
  if (!canEditDob || classes.length === 0) {
    const pendingRequests = await getTeacherPendingClassRequestsAction();
    return (
      <WaitingForAccessCard
        taughtClasses={allTaughtClasses}
        pendingClassIds={pendingRequests}
        canViewBirthdays={canViewBirthdays}
      />
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
