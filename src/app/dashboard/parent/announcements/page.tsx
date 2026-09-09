import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import styles from "../../dashboard.module.css";
import { Megaphone, Clock, AlertCircle, Link as LinkIcon } from "lucide-react";

export default async function ParentAnnouncementsPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'PARENT') return null;

  // Find parent's children to get their class IDs
  const parentRecord = await prisma.parent.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          student: true
        }
      }
    }
  });

  const childClassIds = parentRecord?.children.map(c => c.student.classId).filter(Boolean) || [];

  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [
        { targetType: 'PARENTS' },
        { targetType: 'ALL' },
        {
          targetType: 'CLASS',
          targetId: { in: childClassIds as string[] }
        }
      ]
    },
    orderBy: [
      { priority: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: '1rem' }}>Announcements</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Stay updated with the latest news and notices regarding your children.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {announcements.map(announcement => {
          const isExpired = announcement.expiryDate && new Date(announcement.expiryDate) < new Date();
          if (isExpired) return null; // Don't show expired announcements to parents

          return (
            <div key={announcement.id} style={{ background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Megaphone size={18} color="var(--primary)" />
                    {announcement.title}
                  </h3>
                  {announcement.priority === 'HIGH' && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, background: "var(--danger)", color: "var(--danger-fg)", padding: '0.2rem 0.5rem', borderRadius: '12px', textTransform: 'uppercase' }}>High Priority</span>
                  )}
                </div>
              </div>
              
              <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                {announcement.content}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    <Clock size={14} /> Published on {new Date(announcement.createdAt).toLocaleString()}
                  </div>
                  {announcement.expiryDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <AlertCircle size={14} /> Expires: {new Date(announcement.expiryDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
                
                {announcement.fileUrl && (
                  <a href={announcement.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none' }}>
                    <LinkIcon size={14} /> View Attachment
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {announcements.filter(a => !(a.expiryDate && new Date(a.expiryDate) < new Date())).length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <Megaphone size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', color: 'var(--primary)' }} />
            <p>No active announcements found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
