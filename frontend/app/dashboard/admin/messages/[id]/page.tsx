import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft, GraduationCap, BookOpen, Mail, ShieldCheck } from "lucide-react";
import ChatThreadClient from "@/frontend/components/chat/ChatThreadClient";
import { redirect } from "next/navigation";

export default async function AdminMessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const currentUserId = session.user.id;
  const otherUserId = id;

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    include: {
      parent: {
        include: {
          children: {
            include: {
              student: {
                include: {
                  class: true
                }
              }
            }
          }
        }
      },
      teacher: {
        include: {
          classes: true,
          subjects: true
        }
      }
    }
  });

  if (!otherUser) return <div className={styles.dashboard}><p>User not found.</p></div>;

  // Admins can message both teachers and parents
  if (otherUser.role !== 'TEACHER' && otherUser.role !== 'PARENT') {
    redirect('/dashboard/admin/messages');
  }

  // Check per-user clearedAt boundary
  const meta = await prisma.conversationMeta.findUnique({
    where: {
      userId_otherUserId: {
        userId: currentUserId,
        otherUserId,
      }
    }
  });

  const conditions: any[] = [
    {
      OR: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ]
    },
    {
      NOT: {
        OR: [
          { senderId: currentUserId, deletedForSender: true },
          { receiverId: currentUserId, deletedForReceiver: true }
        ]
      }
    }
  ];

  if (meta?.clearedAt) {
    conditions.push({ createdAt: { gt: meta.clearedAt } });
  }

  const rawMessagesDesc = await prisma.message.findMany({
    where: { AND: conditions },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      content: true,
      senderId: true,
      receiverId: true,
      isRead: true,
      isDeleted: true,
      messageType: true,
      fileUrl: true,
      fileName: true,
      fileSize: true,
      fileType: true,
      duration: true,
      editedAt: true,
      createdAt: true,
    }
  });

  const rawMessages = rawMessagesDesc.reverse();

  // Mark unread received messages and notifications as read in parallel
  await Promise.all([
    prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: currentUserId,
        isRead: false
      },
      data: { isRead: true }
    }),
    prisma.notification.updateMany({
      where: {
        userId: currentUserId,
        type: "MESSAGE",
        link: { contains: otherUserId },
        isRead: false
      },
      data: { isRead: true }
    })
  ]);

  // Context descriptions
  const isTeacher = otherUser.role === 'TEACHER';
  const isParent = otherUser.role === 'PARENT';

  const childrenInfo = otherUser.parent?.children?.map(c => {
    const s = c.student;
    const cls = s.class ? `${s.class.name}-${s.class.section}` : "Unassigned";
    return `${s.firstName} ${s.lastName} (${cls})`;
  }).join(", ") || "";

  const teacherInfo = isTeacher
    ? (otherUser.teacher?.subjects?.map(s => s.name).join(", ") || "General Faculty")
    : "";

  const initialMessages = rawMessages.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    status: "sent" as const,
  }));

  return (
    <div className={styles.dashboard} style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Top Header Card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        padding: '0.85rem 1.25rem',
        borderRadius: '12px',
        backgroundColor: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <Link 
            href="/dashboard/admin/messages" 
            style={{ 
              color: 'var(--foreground)', 
              opacity: 0.8,
              padding: '0.45rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none'
            }}
            title="Back to messages directory"
          >
            <ArrowLeft size={18} />
          </Link>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--foreground)' }}>
                {otherUser.name}
              </h2>
              <span style={{
                padding: '0.15rem 0.55rem',
                borderRadius: '12px',
                fontSize: '0.725rem',
                fontWeight: 700,
                backgroundColor: isParent ? 'rgba(139, 92, 246, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                color: isParent ? '#8b5cf6' : 'var(--primary, #6366f1)'
              }}>
                {isParent ? 'Parent / Guardian' : 'Faculty Teacher'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.2rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Mail size={12} /> {otherUser.email}
              </span>
              {isParent && childrenInfo && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#8b5cf6', fontWeight: 600 }}>
                  <GraduationCap size={13} /> Student(s): {childrenInfo}
                </span>
              )}
              {isTeacher && teacherInfo && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--primary)', fontWeight: 600 }}>
                  <BookOpen size={13} /> {teacherInfo}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.75rem',
          borderRadius: '8px',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          color: '#10b981',
          fontSize: '0.785rem',
          fontWeight: 600
        }}>
          <ShieldCheck size={14} /> Official School Channel
        </div>
      </div>

      {/* WhatsApp-Like Real-Time Chat Thread */}
      <ChatThreadClient
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        otherUserId={otherUserId}
        otherUser={{
          id: otherUser.id,
          name: otherUser.name,
          role: otherUser.role,
          email: otherUser.email,
        }}
        isAdmin={true}
        backHref="/dashboard/admin/messages"
        channelBadge="Official School Channel"
      />
    </div>
  );
}
