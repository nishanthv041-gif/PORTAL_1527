import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import NotificationsCenterClient, { PortalNotificationItem } from "./NotificationsCenterClient";
import { getUnifiedNotificationsAction } from "@/backend/api/actions/notifications/unifiedNotificationActions";

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

  // Fetch unified cross-module notifications (messages, report cards, meetings, announcements, bus alerts, birthdays)
  const unifiedItems = await getUnifiedNotificationsAction({ unreadOnly: false }).catch(() => []);

  const formattedNotifications: PortalNotificationItem[] = unifiedItems.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.description,
    type: n.category,
    category: n.category,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.timestamp,
  }));

  return (
    <NotificationsCenterClient
      initialNotifications={formattedNotifications}
      userRole={session.user.role}
    />
  );
}
