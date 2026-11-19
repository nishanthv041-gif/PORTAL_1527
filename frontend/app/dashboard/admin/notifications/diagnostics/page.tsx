import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { redirect } from "next/navigation";
import DiagnosticsClient from "./DiagnosticsClient";

export const metadata = {
  title: "Universal Push Notifications Diagnostics | Admin",
  description: "Live diagnostic dashboard for OneSignal & WebPush delivery trace, environment health, and per-user subscription verification.",
};

export default async function DiagnosticsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
      <DiagnosticsClient users={users} currentAdminId={session.user.id} />
    </div>
  );
}
