import dynamic from "next/dynamic";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { getMonthCalendarData } from "@/backend/lib/services/calendarDataService";

const ProfessionalSchoolCalendar = dynamic(
  () => import("@/frontend/components/calendar/ProfessionalSchoolCalendar"),
  {
    loading: () => (
      <div style={{ height: "400px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
        Loading school calendar...
      </div>
    ),
  }
);

export default async function TeacherCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const resolvedParams = await searchParams;
  const targetYear = resolvedParams?.year ? parseInt(resolvedParams.year, 10) : undefined;
  const targetMonth = resolvedParams?.month ? parseInt(resolvedParams.month, 10) : undefined;

  const [monthData, teacher] = await Promise.all([
    getMonthCalendarData(targetYear, targetMonth, "TEACHER"),
    prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: { classTeacherOf: true },
    }),
  ]);

  const currentClassId = teacher?.classTeacherOf?.id;
  const currentClassName = teacher?.classTeacherOf
    ? `${teacher.classTeacherOf.name} - ${teacher.classTeacherOf.section}`
    : undefined;

  return (
    <div style={{ padding: "0 0.5rem" }}>
      <ProfessionalSchoolCalendar
        initialData={monthData}
        role="TEACHER"
        currentClassId={currentClassId}
        currentClassName={currentClassName}
        baseRoute="/dashboard/teacher/calendar"
      />
    </div>
  );
}
