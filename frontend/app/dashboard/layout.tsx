import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import Sidebar from "@/frontend/components/Sidebar";
import Topbar from "@/frontend/components/Topbar";
import styles from "./layout.module.css";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

import { SettingsProvider } from "@/frontend/contexts/SettingsContext";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(getAuthOptions());

  if (!session) {
    redirect("/login");
  }

  const settings = await getSystemSettings();

  if (settings.MAINTENANCE_MODE === "true" && session.user.role !== "ADMIN") {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', color: 'var(--primary)' }}>System Under Maintenance</h1>
        <p style={{ fontSize: '1.1rem', maxWidth: '500px', lineHeight: 1.5, opacity: 0.8 }}>
          We are currently performing scheduled maintenance on the portal. Please check back later.
        </p>
      </div>
    );
  }

  return (
    <SettingsProvider settings={settings}>
      <div className={styles.container}>
        {settings.SCHOOL_LOGO && (
          <>
            {/* Ambient color aurora from logo */}
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100vw',
              height: '100vh',
              backgroundImage: `url(${settings.SCHOOL_LOGO})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.06,
              filter: 'blur(100px)',
              pointerEvents: 'none',
              zIndex: 0
            }} />
            
            {/* Centered logo with radial mask to hide edges */}
            <div style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '60vw',
              height: '60vw',
              maxWidth: '700px',
              maxHeight: '700px',
              backgroundImage: `url(${settings.SCHOOL_LOGO})`,
              backgroundSize: 'contain',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: 0.04,
              pointerEvents: 'none',
              zIndex: 0,
              WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 70%)',
              maskImage: 'radial-gradient(circle, black 30%, transparent 70%)'
            }} />
          </>
        )}
        <input type="checkbox" id="mobile-menu-toggle" className={styles.mobileMenuToggle} />
        
        <div className={styles.sidebarWrapper}>
          <Sidebar role={session.user.role} settings={settings} />
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
    </SettingsProvider>
  );
}
