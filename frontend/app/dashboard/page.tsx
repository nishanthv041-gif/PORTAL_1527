import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";
import UniversalDashboard from "@/frontend/components/dashboard/UniversalDashboard";

export default async function DashboardRoot() {
  const session = await getCachedServerSession();

  if (!session) {
    redirect("/login");
  }

  const role = (session.user.role || "").toUpperCase();

  // Primary redirection based on role
  if (role === "TEACHER") {
    redirect("/dashboard/teacher");
  } else if (role === "PARENT") {
    redirect("/dashboard/parent");
  } else if (role === "ADMIN") {
    redirect("/dashboard/admin");
  } else if (role === "STAFF" || role === "NON_TEACHING_STAFF") {
    redirect("/staff/my-bus");
  }

  // Resilient fallback: Render full Universal Dashboard if redirect is delayed or not matched
  return (
    <UniversalDashboard
      user={{
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
    />
  );
}
