import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import TeacherNotificationsClient from "./TeacherNotificationsClient";

export default async function TeacherNotificationsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationsEnabled: true }
  });
  const isEnabled = dbUser?.notificationsEnabled ?? true;

  const notifications = isEnabled ? await prisma.notification.findMany({
    where: { userId: session.user.id },
    take: 40,
    select: {
      id: true,
      title: true,
      content: true,
      type: true,
      category: true,
      link: true,
      isRead: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  }) : [];

  return (
    <TeacherNotificationsClient
      initialNotifications={notifications}
      userId={session.user.id}
      initialEnabled={isEnabled}
    />
  );
}
