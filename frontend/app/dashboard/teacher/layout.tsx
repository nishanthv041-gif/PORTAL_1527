import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";
import TeacherBottomNav from "@/frontend/components/Layout/TeacherBottomNav";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCachedServerSession();

  if (!session) {
    redirect("/login");
  }

  const role = session.user.role.toUpperCase();
  const availableRoles = ((session.user as any).availableRoles || [role]).map((r: string) => r.toUpperCase());

  if (role !== "TEACHER") {
    if (availableRoles.includes("TEACHER") || role === "ADMIN") {
      try {
        const { prisma } = await import("@/backend/db/prisma");
        await prisma.user.update({
          where: { id: session.user.id },
          data: { role: "TEACHER" },
        });
      } catch (err) {
        console.warn("[TeacherLayout] Error activating teacher role:", err);
      }
    } else {
      redirect("/dashboard");
    }
  }

  return (
    <>
      <div style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 1.25rem)" }}>
        {children}
      </div>
      <TeacherBottomNav />
    </>
  );
}

