import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import Sidebar from "@/frontend/components/Sidebar";
import Topbar from "@/frontend/components/Topbar";
import styles from "./layout.module.css";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

import { SettingsProvider } from "@/frontend/contexts/SettingsContext";
import NavigationProgressBar from "@/frontend/components/NavigationProgressBar";
import SchoolPortalLoadingAnimation from "@/frontend/components/SchoolPortalLoadingAnimation";
import NotificationPopupModal from "@/frontend/components/notifications/NotificationPopupModal";
import PortalBreadcrumb from "@/frontend/components/PortalBreadcrumb";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(getAuthOptions());

  if (!session) {
    redirect("/login");
  }

  // Fast-path: session already contains user name and notification preferences
  const displayName = session.user.name || "User";
  const notificationsEnabled = session.user.notificationsEnabled ?? true;

  // Fetch only system settings (instant from unstable_cache memory)
  // Notifications are handled asynchronously by the client modal to keep route switching instant
  const settings = await getSystemSettings();

  return (
    <SettingsProvider settings={settings}>
      <NavigationProgressBar />
      <SchoolPortalLoadingAnimation
        schoolName={settings.SCHOOL_NAME || "SRT School Management Portal"}
        schoolLogo={settings.SCHOOL_LOGO || null}
      />
      <NotificationPopupModal initialNotifications={[]} notificationsEnabled={notificationsEnabled} />
      <div className={styles.container}>
        {/* Subtle, beautiful, fixed school campus backdrop */}
        <div className={styles.portalBackground} aria-hidden="true" />
        <input type="checkbox" id="mobile-menu-toggle" className={styles.mobileMenuToggle} />

        <div className={styles.sidebarWrapper}>
          <Sidebar role={session.user.role} settings={settings} />
        </div>

        {/* Global touch backdrop overlay for mobile menu drawer */}
        <label htmlFor="mobile-menu-toggle" className={styles.menuOverlay} aria-label="Close Navigation Drawer"></label>

        <div className={styles.mainContent}>
          <div className={styles.topbarContainer}>
            <label htmlFor="mobile-menu-toggle" className={styles.hamburger} aria-label="Toggle Navigation Menu">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </label>
            <Topbar user={{ ...session.user, name: displayName }} />
          </div>
          <main className={styles.pageContent}>
            <PortalBreadcrumb />
            {children}
          </main>
        </div>
      </div>
    </SettingsProvider>
  );
}
