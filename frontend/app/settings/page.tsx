import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { prisma } from "@/backend/db/prisma";
import SettingsClient from "@/frontend/components/settings/SettingsClient";
import Footer from "@/frontend/components/Footer";

export const metadata = {
  title: "Settings | SRT Universal School",
  description: "Account settings, preferences, security, and school profile configuration.",
};

export default async function SettingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [user, teacher, parent, staff, systemSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        theme: true,
        notificationsEnabled: true,
      },
    }),
    prisma.teacher.findUnique({
      where: { userId },
      select: { phone: true, alternatePhone: true, qualification: true },
    }),
    prisma.parent.findUnique({
      where: { userId },
      select: { phone: true, alternatePhone: true },
    }),
    prisma.staff.findUnique({
      where: { userId },
      select: { phone: true },
    }),
    session.user.role === "ADMIN"
      ? prisma.systemSetting.findMany({ select: { key: true, value: true } })
      : Promise.resolve([]),
  ]);

  if (!user) {
    redirect("/login");
  }

  const roleProfile = {
    phone: teacher?.phone || parent?.phone || staff?.phone || "",
    alternatePhone: teacher?.alternatePhone || parent?.alternatePhone || "",
    qualification: teacher?.qualification || "",
  };

  const schoolDefaultsMap: Record<string, string> = {};
  if (systemSettings) {
    systemSettings.forEach((s) => {
      schoolDefaultsMap[s.key] = s.value;
    });
  }

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--background, #f8fafc)",
      }}
    >
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "clamp(1rem, 2.5vw, 2.5rem) 1rem",
          boxSizing: "border-box",
        }}
      >
        <SettingsClient
          user={user}
          roleProfile={roleProfile}
          schoolDefaults={schoolDefaultsMap}
        />
      </main>
      <Footer />
    </div>
  );
}

