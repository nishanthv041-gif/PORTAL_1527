import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import Sidebar from "@/frontend/components/Sidebar";
import Topbar from "@/frontend/components/Topbar";
import styles from "./layout.module.css";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }



  return (
    <div className={styles.container}>
      <Sidebar role={session.user.role} />
      <div className={styles.mainContent}>
        <Topbar user={session.user} />
        <main className={styles.pageContent}>{children}</main>
      </div>
    </div>
  );
}
