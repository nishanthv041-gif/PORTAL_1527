import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import Link from "next/link";
import styles from "../../../dashboard.module.css";
import { ArrowLeft } from "lucide-react";
import MessageForm from "./MessageForm";
import MessageItem from "@/frontend/components/MessageItem";
import { redirect } from "next/navigation";

export default async function AdminMessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const currentUserId = session.user.id;
  const otherUserId = id;

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId }
  });

  if (!otherUser) return <p>User not found.</p>;

  // Admins can only message teachers.
  if (otherUser.role !== 'TEACHER') {
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

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <Link href="/dashboard/admin/messages" style={{ color: 'var(--foreground)', opacity: 0.7 }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className={styles.title} style={{ margin: 0 }}>
          {otherUser.name}
        </h1>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>({otherUser.role})</span>
      </div>

      <div className={styles.chartCard} style={{ display: 'flex', flexDirection: 'column', height: '60vh' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', marginBottom: '1rem' }}>
          {messages.map((msg) => (
            <MessageItem key={msg.id} message={msg} currentUserId={currentUserId} />
          ))}
          {messages.length === 0 && (
            <p style={{ textAlign: 'center', opacity: 0.5, marginTop: '2rem' }}>No messages yet. Send a message to start the conversation.</p>
          )}
        </div>
        
        <MessageForm receiverId={otherUserId} />
      </div>
    </div>
  );
}
