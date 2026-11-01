import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import styles from "@/frontend/app/dashboard/dashboard.module.css";
import { getTransportOverviewAction } from "@/backend/api/actions/dashboard/admin/transport/actions";
import AdminBusManagement from "@/frontend/components/transport/AdminBusManagement";

export const dynamic = "force-dynamic";

export default async function AdminBusesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user || !["ADMIN", "TEACHER"].includes(session.user.role)) {
    redirect("/login");
  }

  const overviewRes = await getTransportOverviewAction();
  const overview = overviewRes.data || {
    buses: [],
    staffList: [],
    classes: [],
    recentMessages: [],
    recentStatusLogs: [],
    summaryMetrics: undefined,
  };

  return (
    <div className={styles.dashboard}>
      <AdminBusManagement
        initialBuses={overview.buses}
        staffList={overview.staffList}
        classes={overview.classes}
        recentMessages={overview.recentMessages}
        recentStatusLogs={overview.recentStatusLogs}
        summaryMetrics={overview.summaryMetrics}
        currentUserName={session.user.name || "Administrator"}
      />
    </div>
  );
}

