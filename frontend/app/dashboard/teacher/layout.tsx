import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import TeacherBottomNav from "@/frontend/components/Layout/TeacherBottomNav";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(getAuthOptions());

  if (!session) {
    redirect("/login");
  }

  if (session.user.role.toUpperCase() !== "TEACHER") {
    redirect("/dashboard");
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

