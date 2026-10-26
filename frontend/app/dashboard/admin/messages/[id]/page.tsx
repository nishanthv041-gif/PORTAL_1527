import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft, User, GraduationCap, BookOpen, Mail, Phone, ShieldCheck } from "lucide-react";
import MessageForm from "./MessageForm";
import MessageItem from "@/frontend/components/MessageItem";
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

  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ]
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  // Mark messages as read
  await prisma.message.updateMany({
    where: {
      senderId: otherUserId,
      receiverId: currentUserId,
      isRead: false
    },
    data: {
      isRead: true
    }
  });

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

  return (
    <div className={styles.dashboard}>
      {/* Top Header Card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem',
        padding: '1rem 1.25rem',
        borderRadius: '12px',
        backgroundColor: 'var(--card-bg, #ffffff)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
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

          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            backgroundColor: isParent ? 'rgba(139, 92, 246, 0.12)' : 'rgba(99, 102, 241, 0.12)',
            color: isParent ? '#8b5cf6' : 'var(--primary, #6366f1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1rem'
          }}>
            {otherUser.name.charAt(0).toUpperCase()}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)' }}>
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

      {/* Messages Thread Container */}
      <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1.25rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem', 
          border: '1px solid var(--border-color)', 
          borderRadius: '10px', 
          marginBottom: '1rem',
          backgroundColor: 'var(--background)'
        }}>
          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
          ))}
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', margin: 'auto', opacity: 0.6, padding: '2rem' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No messages yet with {otherUser.name}.</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>Send a direct message below to start this administrative conversation.</p>
            </div>
          )}
        </div>
        
        <MessageForm receiverId={otherUserId} />
      </div>
    </div>
  );
}
