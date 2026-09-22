import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await getServerSession(getAuthOptions());

  if (session) {
    switch (session.user.role) {
      case 'ADMIN':
        redirect("/dashboard/admin");
      case 'TEACHER':
        redirect("/dashboard/teacher");
      case 'PARENT':
        redirect("/dashboard/parent");
      case 'STUDENT':
      default:
        redirect("/dashboard");
    }
  }

  // If no session, redirect to the new root portal selection page
  redirect("/");
}
