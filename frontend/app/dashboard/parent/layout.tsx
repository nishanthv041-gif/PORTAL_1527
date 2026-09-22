import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(getAuthOptions());

  if (!session) {
    redirect("/login");
  }

  if (session.user.role.toUpperCase() !== "PARENT") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
