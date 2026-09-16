import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import { Bell, CheckCircle, Clock, Trash2 } from "lucide-react";
import MarkReadButton from "./MarkReadButton";
import ToggleNotifications from "@/frontend/components/ToggleNotifications";
import { toggleNotificationsEnabled, deleteNotificationAction } from "@/backend/actions/dashboard/teacher/notifications/actions";

export default async function TeacherNotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationsEnabled: true }
  });
  const isEnabled = dbUser?.notificationsEnabled ?? true;

  const notifications = isEnabled ? await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' }
  }) : [];

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Notifications</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Stay updated with your latest alerts and messages.</p>

      <ToggleNotifications 
        userId={session.user.id} 
        initialEnabled={isEnabled} 
        toggleAction={toggleNotificationsEnabled} 
      />

      {!isEnabled ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <Bell size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
          <p>Notifications are currently paused.</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>Turn them back on to see your alerts and history.</p>
        </div>
      ) : (
        <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {notifications.map((notification) => (
            <div key={notification.id} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '1.25rem', 
              border: '1px solid var(--border)', 
              borderRadius: '8px', 
              backgroundColor: notification.isRead ? 'var(--background)' : 'rgba(99, 102, 241, 0.05)',
              borderLeft: notification.isRead ? '1px solid var(--border)' : '4px solid var(--primary)'
            }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--foreground)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bell size={16} color={notification.isRead ? 'var(--text-secondary)' : 'var(--primary)'} />
                  {notification.title}
                </h4>
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {notification.content}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', opacity: 0.7 }}>
                  <Clock size={12} /> {new Date(notification.createdAt).toLocaleString()}
                </div>
              </div>
              
              {!notification.isRead && (
                <MarkReadButton notificationId={notification.id} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {notification.isRead && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: "var(--success)", background: 'var(--success-bg)', padding: '4px 8px', borderRadius: '12px' }}>
                    <CheckCircle size={14} /> Read
                  </div>
                )}
                <form action={async () => {
                  "use server";
                  await deleteNotificationAction(notification.id);
                }}>
                  <button type="submit" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={16} />
                  </button>
                </form>
              </div>
            </div>
          ))}

          {notifications.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: '12px' }}>
              <Bell size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
              <p>You have no notifications.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
