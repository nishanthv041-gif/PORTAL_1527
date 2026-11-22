import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";
import HomeClient from "./HomeClient";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

interface HomeProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home(props: HomeProps) {
  const searchParams = await props.searchParams;
  const session = await getCachedServerSession();

  // Instant Launch: If user is authenticated, skip landing/splash and go directly to their home dashboard
  if (session?.user?.role) {
    const role = session.user.role.toUpperCase();
    const target =
      role === "ADMIN"
        ? "/dashboard/admin"
        : role === "TEACHER"
        ? "/dashboard/teacher"
        : role === "PARENT"
        ? "/dashboard/parent"
        : role === "STAFF" || role === "NON_TEACHING_STAFF"
        ? "/staff/my-bus"
        : "/dashboard";
    redirect(target);
  }

  const settings = await getSystemSettings();
  const schoolName = settings.SCHOOL_NAME || "SRT UNIVERSAL SCHOOL";
  const schoolLogo = settings.SCHOOL_LOGO || "/logo/srt-logo.svg";

  return (
    <HomeClient
      schoolName={schoolName}
      schoolLogo={schoolLogo}
      initialError={searchParams.error}
      authenticatedRole={null}
    />
  );
}
