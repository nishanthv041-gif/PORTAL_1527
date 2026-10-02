import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import Sidebar from "@/frontend/components/Sidebar";
import Topbar from "@/frontend/components/Topbar";
import styles from "./layout.module.css";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(getAuthOptions());

  if (!session) {
    redirect("/login");
  }



  return (
    <div className={styles.container}>
      <input type="checkbox" id="mobile-menu-toggle" className={styles.mobileMenuToggle} />
      
      <div className={styles.sidebarWrapper}>
        <Sidebar role={session.user.role} />
      </div>
      
      <div className={styles.mainContent}>
        <div className={styles.topbarContainer}>
          <label htmlFor="mobile-menu-toggle" className={styles.menuOverlay}></label>
          <label htmlFor="mobile-menu-toggle" className={styles.hamburger}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </label>
          <Topbar user={session.user} />
        </div>
        <main className={styles.pageContent}>{children}</main>
      </div>
    </div>
  );
}
