"use client";

import { Bell, Info, AlertTriangle, CheckCircle, XCircle, Clock, Trash2, CheckCheck } from "lucide-react";
import { Notification, User } from "@prisma/client";
import { deleteNotification, markAllNotificationsRead, toggleNotificationsEnabled } from "@/backend/actions/dashboard/admin/notifications/actions";
import ToggleNotifications from "@/frontend/components/ToggleNotifications";
import { useRouter } from "next/navigation";

type NotificationWithUser = Notification & { user: User };

export default function NotificationsClient({ notifications, adminUserId, initialEnabled }: { notifications: NotificationWithUser[], adminUserId: string, initialEnabled: boolean }) {
  const router = useRouter();
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'INFO': return <Info size={18} color="var(--primary)" />;
      case 'WARNING': return <AlertTriangle size={18} color="var(--warning)" />;
      case 'SUCCESS': return <CheckCircle size={18} color="var(--success)" />;
      case 'ERROR': return <XCircle size={18} color="var(--danger)" />;
      default: return <Bell size={18} />;
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete this notification?")) {
      const res = await deleteNotification(id);
      if (res.error) alert(res.error);
      else router.refresh();
    }
  };

  const handleMarkAllRead = async () => {
    const res = await markAllNotificationsRead(adminUserId);
    if (res.error) alert(res.error);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div>
      <ToggleNotifications 
        userId={adminUserId} 
        initialEnabled={initialEnabled} 
        toggleAction={toggleNotificationsEnabled} 
      />
      {unreadCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <button
            onClick={handleMarkAllRead}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: "var(--primary)", color: "var(--primary-fg)", border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
          >
            <CheckCheck size={16} /> Mark All as Read ({unreadCount})
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {notifications.map(notif => (
          <div key={notif.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: `1px solid ${!notif.isRead ? 'var(--primary)' : 'var(--border-color)'}`, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ padding: '0.5rem', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
                {getTypeIcon(notif.type)}
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{notif.title}</h3>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {notif.content}
                </p>
              </div>
              <button
                onClick={() => handleDelete(notif.id)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0.25rem', borderRadius: '4px', flexShrink: 0 }}
                title="Delete notification"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>To: {notif.user.name}</span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <Clock size={14} /> {new Date(notif.createdAt).toLocaleString()}
                </span>
                <span style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', padding: '0.25rem 0.5rem', borderRadius: '12px', background: notif.isRead ? 'var(--success-bg)' : 'rgba(107, 114, 128, 0.1)', color: notif.isRead ? "var(--success)" : "var(--text-secondary)" }}>
                  {notif.isRead ? 'Read' : 'Unread'}
                </span>
              </div>
            </div>

          </div>
        ))}

        {!initialEnabled ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <Bell size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>Notifications are currently paused.</p>
            <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>Turn them back on to see your alerts and history.</p>
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <Bell size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
            <p>No notifications yet.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
