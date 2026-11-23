import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";
import ParentBottomNav from "@/frontend/components/Layout/ParentBottomNav";
import ParentScreenshotProtection from "@/frontend/components/security/ParentScreenshotProtection";

export default async function ParentLayout({
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

  if (role !== "PARENT") {
    if (availableRoles.includes("PARENT") || role === "ADMIN") {
      try {
        const { prisma } = await import("@/backend/db/prisma");
        await prisma.user.update({
          where: { id: session.user.id },
          data: { role: "PARENT" },
        });
      } catch (err) {
        console.warn("[ParentLayout] Error activating parent role:", err);
      }
    } else {
      redirect("/dashboard");
    }
  }

  return (
    <>
      <ParentScreenshotProtection />
      <div style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 1.25rem)" }}>
        {children}
      </div>
      <ParentBottomNav />
    </>
  );
}
