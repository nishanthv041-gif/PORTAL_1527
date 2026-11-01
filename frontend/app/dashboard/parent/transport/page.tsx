import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import styles from "../../dashboard.module.css";
import { getParentBusOverviewAction } from "@/backend/api/actions/dashboard/admin/transport/actions";
import ParentBusClient from "@/frontend/components/transport/ParentBusClient";

export const dynamic = "force-dynamic";

export default async function ParentTransportPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user || session.user.role !== "PARENT") {
    redirect("/login");
  }

  const res = await getParentBusOverviewAction();
  const childrenTransport = res.children || [];

  return (
    <div className={styles.dashboard}>
      <ParentBusClient childrenTransport={childrenTransport} />
    </div>
  );
}
