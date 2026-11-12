import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { prisma } from "@/backend/db/prisma";
import NotificationsCenterClient, { PortalNotificationItem } from "./NotificationsCenterClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications | SRT Universal School Portal",
  description: "View all academic alerts, report cards, homework, messages, and announcements.",
};

export default async function NotificationsPage() {
  const session = await getServerSession(getAuthOptions());

  if (!session?.user) {
    redirect("/login");
  }

  const rawNotifications = await prisma.notification.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
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
  });

  const formattedNotifications: PortalNotificationItem[] = rawNotifications.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    type: n.type,
    category: n.category,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <NotificationsCenterClient
      initialNotifications={formattedNotifications}
      userRole={session.user.role}
    />
  );
}
