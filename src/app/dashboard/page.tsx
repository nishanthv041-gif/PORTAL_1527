import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export default async function DashboardRoot() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const role = session.user.role.toUpperCase();

  if (role === "TEACHER") {
    redirect("/dashboard/teacher");
  } else if (role === "PARENT") {
    redirect("/dashboard/parent");
  } else if (role === "ADMIN") {
    redirect("/dashboard/admin");
  } else {
    redirect("/login");
  }
}
