import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../../dashboard.module.css";
import ChatThreadClient from "@/frontend/components/chat/ChatThreadClient";

export default async function ParentMessageThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const currentUserId = session.user.id;
  const otherUserId = id;

  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: { id: true, name: true, role: true, email: true },
  });

  if (!otherUser) return <p>User not found.</p>;

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

  const rawMessages = await prisma.message.findMany({
    where: { AND: conditions },
    orderBy: {
      createdAt: 'asc'
    },
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

  // Mark unread received messages as read
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

  // Also mark corresponding message notifications as read
  await prisma.notification.updateMany({
    where: {
      userId: currentUserId,
      type: "MESSAGE",
      link: { contains: otherUserId },
      isRead: false
    },
    data: {
      isRead: true
    }
  });

  const initialMessages = rawMessages.map(m => ({
    ...m,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    status: "sent" as const,
  }));

  return (
    <div className={styles.dashboard} style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <ChatThreadClient
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        otherUserId={otherUserId}
        otherUser={otherUser}
        isAdmin={session.user.role === "ADMIN"}
        backHref="/dashboard/parent/messages"
      />
    </div>
  );
}
