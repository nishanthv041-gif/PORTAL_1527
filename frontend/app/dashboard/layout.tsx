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

  if (false && settings.MAINTENANCE_MODE === "true" && session?.user?.role !== "ADMIN") {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100dvh', 
        padding: '1.5rem', 
        textAlign: 'center', 
        backgroundColor: 'var(--background)', 
        color: 'var(--foreground)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Ambient Glows */}
        <div style={{
          position: 'absolute',
          top: '0',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)',
          opacity: 0.1,
          filter: 'blur(60px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div style={{
          background: 'var(--card)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--border)',
          borderRadius: '24px',
          padding: '3rem 2rem',
          maxWidth: '500px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          zIndex: 1
        }}>
          {/* Settings/Maintenance Icon */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'var(--primary-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
            color: 'var(--primary)',
            boxShadow: '0 0 20px var(--primary-bg)'
          }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </div>

          <h1 style={{ 
            fontSize: 'clamp(1.5rem, 5vw, 2.25rem)', 
            fontWeight: '700', 
            marginBottom: '1rem', 
            color: 'var(--primary)',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            textAlign: 'center'
          }}>
            System Under Maintenance
          </h1>
          <p style={{ 
            fontSize: 'clamp(1rem, 3vw, 1.125rem)', 
            lineHeight: 1.6, 
            opacity: 0.8,
            margin: 0,
            textAlign: 'center'
          }}>
            We are currently performing scheduled maintenance on the portal. Please check back later.
          </p>
        </div>
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
