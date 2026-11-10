import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getAuthorizedBirthdayClasses } from "@/lib/teacher/classAccess";
import { getClassBirthdayWishesSummaryAction } from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { getTeacherPendingClassRequestsAction } from "@/backend/api/actions/dashboard/teacher/classTeacherRequestActions";
import BirthdayWishesStudio from "@/frontend/components/birthdays/BirthdayWishesStudio";
import WaitingForAccessCard from "@/frontend/components/birthdays/WaitingForAccessCard";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ classId?: string }>;
}

export default async function TeacherBirthdaysPage(props: PageProps) {
  const session = await getServerSession(getAuthOptions());
  if (!session || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const {
    classes,
    allTaughtClasses,
    selectedClassId,
    canViewBirthdays,
    isDesignatedClassTeacher,
  } = await getAuthorizedBirthdayClasses();

  if (!canViewBirthdays || classes.length === 0) {
    const pendingRequests = await getTeacherPendingClassRequestsAction();
    return (
      <WaitingForAccessCard
        taughtClasses={allTaughtClasses}
        pendingClassIds={pendingRequests}
        canViewBirthdays={false}
      />
    );
  }

  const activeClassId = searchParams?.classId || selectedClassId || classes[0].classId;
  const summary = await getClassBirthdayWishesSummaryAction(activeClassId);

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <BirthdayWishesStudio
        userRole={session.user.role as "ADMIN" | "TEACHER"}
        classes={classes}
        selectedClassId={activeClassId}
        className={summary.className}
        todayCelebrants={summary.todayCelebrants}
        upcoming7Days={summary.upcoming7Days}
        upcoming30Days={summary.upcoming30Days}
        totalCelebrantsThisMonth={summary.totalCelebrantsThisMonth}
        missingDobCount={summary.missingDobCount}
        totalStudents={summary.totalStudents}
        settings={summary.settings}
        isClassTeacher={isDesignatedClassTeacher}
      />
    </div>
  );
}
