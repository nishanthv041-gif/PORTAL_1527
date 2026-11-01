import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import styles from "../../dashboard.module.css";
import { getParentTransportOverviewAction } from "@/backend/api/actions/dashboard/admin/transport/actions";
import ParentTransportClient from "./ParentTransportClient";

export const dynamic = "force-dynamic";

export default async function ParentTransportPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user || session.user.role !== "PARENT") {
    redirect("/login");
  }

  const res = await getParentTransportOverviewAction();
  const childrenTransport = res.children || [];

  return (
    <div className={styles.dashboard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Bus &amp; Transportation Details</h1>
      </div>

      <ParentTransportClient childrenTransport={childrenTransport} />
    </div>
  );
}

