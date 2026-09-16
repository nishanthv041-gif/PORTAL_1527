import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user.role.toUpperCase() !== "TEACHER") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
