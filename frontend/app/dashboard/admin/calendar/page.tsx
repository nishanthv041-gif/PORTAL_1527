import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import ProfessionalSchoolCalendar from "@/frontend/components/calendar/ProfessionalSchoolCalendar";
import { getMonthCalendarData } from "@/backend/lib/services/calendarDataService";

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") return null;

  const resolvedParams = await searchParams;
  const targetYear = resolvedParams?.year ? parseInt(resolvedParams.year, 10) : undefined;
  const targetMonth = resolvedParams?.month ? parseInt(resolvedParams.month, 10) : undefined;

  const [monthData, classes] = await Promise.all([
    getMonthCalendarData(targetYear, targetMonth, "ADMIN"),
    prisma.class.findMany({
      where: { isActive: true },
      select: { id: true, name: true, section: true },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    }),
  ]);

  return (
    <div style={{ padding: "0 0.5rem" }}>
      <ProfessionalSchoolCalendar
        initialData={monthData}
        classes={classes}
        role="ADMIN"
        baseRoute="/dashboard/admin/calendar"
      />
    </div>
  );
}
