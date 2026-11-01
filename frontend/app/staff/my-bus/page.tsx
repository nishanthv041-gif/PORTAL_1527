import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import styles from "@/frontend/app/dashboard/dashboard.module.css";
import { getStaffAssignedBusesAction } from "@/backend/api/actions/dashboard/admin/transport/actions";
import StaffMyBusClient from "@/frontend/components/transport/StaffMyBusClient";

export const dynamic = "force-dynamic";

export default async function StaffMyBusPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
    redirect("/login");
  }

  const res = await getStaffAssignedBusesAction();
  const buses = res.buses || [];

  return (
    <div className={styles.dashboard}>
      <StaffMyBusClient
        buses={buses}
        staffName={session.user.name || "Staff Member"}
      />
    </div>
  );
}

