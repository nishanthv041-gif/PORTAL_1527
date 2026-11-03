import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";
import ParentBottomNav from "@/frontend/components/Layout/ParentBottomNav";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCachedServerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role.toUpperCase() !== "PARENT") {
    redirect("/dashboard");
  }

  return (
    <>
      <div style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 1.25rem)" }}>
        {children}
      </div>
      <ParentBottomNav />
    </>
  );
}
