import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import ProfessionalSchoolCalendar from "@/frontend/components/calendar/ProfessionalSchoolCalendar";
import { getMonthCalendarData } from "@/backend/lib/services/calendarDataService";

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

  const monthData = await getMonthCalendarData(targetYear, targetMonth, "TEACHER");

  return (
    <div style={{ padding: "0 0.5rem" }}>
      <ProfessionalSchoolCalendar
        initialData={monthData}
        role="TEACHER"
        baseRoute="/dashboard/teacher/calendar"
      />
    </div>
  );
}
