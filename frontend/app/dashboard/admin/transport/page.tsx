import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import styles from "../../dashboard.module.css";
import { getTransportOverviewAction } from "@/backend/api/actions/dashboard/admin/transport/actions";
import TransportClient from "./TransportClient";

export const dynamic = "force-dynamic";

export default async function AdminTransportPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user || !["ADMIN", "TEACHER"].includes(session.user.role)) {
    redirect("/login");
  }

  const overviewRes = await getTransportOverviewAction();
  const overview = overviewRes.data || {
    buses: [],
    teachers: [],
    classes: [],
    recentAlerts: [],
  };

  return (
    <div className={styles.dashboard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Bus Details &amp; Transport Management</h1>
      </div>

      <TransportClient
        initialBuses={overview.buses}
        teachers={overview.teachers}
        classes={overview.classes}
        initialAlerts={overview.recentAlerts}
        currentUserRole={session.user.role}
        currentUserName={session.user.name || "Administrator"}
      />
    </div>
  );
}

