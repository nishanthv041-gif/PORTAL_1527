"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

interface ToggleNotificationsProps {
  userId: string;
  initialEnabled: boolean;
  toggleAction: (userId: string, enabled: boolean) => Promise<{ success?: boolean; error?: string }>;
}

export default function ToggleNotifications({ userId, initialEnabled, toggleAction }: ToggleNotificationsProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleToggle = async () => {
    setIsLoading(true);
    const newValue = !enabled;
    const res = await toggleAction(userId, newValue);
    if (res.error) {
      alert(res.error);
    } else {
      setEnabled(newValue);
      router.refresh();
    }
    setIsLoading(false);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {enabled ? <Bell size={18} color="var(--primary)" /> : <BellOff size={18} color="var(--text-secondary)" />}
          Notifications
        </h3>
        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          {enabled ? "You will receive alerts for new activity." : "Notifications are paused. You will not receive new alerts."}
        </p>
      </div>
      <button
        onClick={handleToggle}
        disabled={isLoading}
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          border: 'none',
          backgroundColor: enabled ? 'var(--primary)' : 'var(--text-muted)',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.3s'
        }}
      >
        <div style={{
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: '#fff',
          transition: 'left 0.3s',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }} />
      </button>
    </div>
  );
}
