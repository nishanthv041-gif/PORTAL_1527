import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import ProfessionalSchoolCalendar from "@/frontend/components/calendar/ProfessionalSchoolCalendar";
import { getMonthCalendarData } from "@/backend/lib/services/calendarDataService";
import { getParentAndSelectedChild } from "../parentChildHelper";

export default async function ParentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; childId?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const resolvedParams = await searchParams;
  const targetYear = resolvedParams?.year ? parseInt(resolvedParams.year, 10) : undefined;
  const targetMonth = resolvedParams?.month ? parseInt(resolvedParams.month, 10) : undefined;

  const [{ selectedChild }, monthData] = await Promise.all([
    getParentAndSelectedChild(resolvedParams?.childId),
    getMonthCalendarData(targetYear, targetMonth, "PARENT"),
  ]);

  const currentClassId = selectedChild?.classId || undefined;
  const currentClassName = selectedChild?.class
    ? `${selectedChild.class.name} - ${selectedChild.class.section}`
    : undefined;

  return (
    <div style={{ padding: "0 0.5rem" }}>
      <ProfessionalSchoolCalendar
        initialData={monthData}
        role="PARENT"
        currentClassId={currentClassId}
        currentClassName={currentClassName}
        baseRoute="/dashboard/parent/calendar"
      />
    </div>
  );
}
