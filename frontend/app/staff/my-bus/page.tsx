import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { prisma } from "@/backend/db/prisma";
import { getSchoolNow } from "@/lib/time";
import styles from "@/frontend/app/dashboard/dashboard.module.css";
import { getStaffAssignedBusesAction } from "@/backend/api/actions/dashboard/admin/transport/actions";
import StaffMyBusClient from "@/frontend/components/transport/StaffMyBusClient";

export const dynamic = "force-dynamic";

export default async function StaffMyBusPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
    redirect("/login");
  }

  const schoolToday = getSchoolNow();
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const isNonLeapFeb28 = !isLeap(schoolToday.year) && schoolToday.month === 2 && schoolToday.day === 28;

  const [res, staffUser] = await Promise.all([
    getStaffAssignedBusesAction(),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { dateOfBirth: true, staff: { select: { dateOfBirth: true } } },
    }),
  ]);

  const buses = res.buses || [];
  const staffDob = staffUser?.staff?.dateOfBirth || staffUser?.dateOfBirth;
  let isStaffBirthday = false;
  if (staffDob) {
    const sd = new Date(staffDob);
    const sm = sd.getUTCMonth() + 1;
    const sday = sd.getUTCDate();
    if (sm === schoolToday.month && sday === schoolToday.day) isStaffBirthday = true;
    if (isNonLeapFeb28 && sm === 2 && sday === 29) isStaffBirthday = true;
  }

  return (
    <div className={styles.dashboard}>
      {isStaffBirthday && (
        <div style={{
          background: "linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)",
          border: "1px solid #f59e0b",
          borderRadius: "14px",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 4px 12px rgba(245, 158, 11, 0.15)",
          color: "#78350f"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={{ fontSize: "2rem" }}>🎂</div>
            <div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "#92400e" }}>
                Happy Birthday, {session.user.name || "Staff Member"}! 🎉
              </div>
              <div style={{ fontSize: "0.85rem", color: "#b45309", marginTop: "2px" }}>
                SRT School wishes you a joyful, healthy, and successful year ahead! Thank you for your valuable support.
              </div>
            </div>
          </div>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", background: "#f59e0b", color: "#ffffff" }}>
            SRT School Wishes You
          </span>
        </div>
      )}

      <StaffMyBusClient
        buses={buses}
        staffName={session.user.name || "Staff Member"}
      />
    </div>
  );
}
