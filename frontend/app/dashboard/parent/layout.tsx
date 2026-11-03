import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";

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

  return <>{children}</>;
}
