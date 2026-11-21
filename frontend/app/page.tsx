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

  if (session?.user?.role) {
    const role = session.user.role.toUpperCase();
    if (role === "ADMIN") redirect("/dashboard/admin");
    if (role === "TEACHER") redirect("/dashboard/teacher");
    if (role === "PARENT") redirect("/dashboard/parent");
    if (role === "STAFF" || role === "NON_TEACHING_STAFF") redirect("/staff/my-bus");
    redirect("/dashboard");
  }

  const settings = await getSystemSettings();
  const schoolName = settings.SCHOOL_NAME || "SRT UNIVERSAL SCHOOL";
  const schoolLogo = settings.SCHOOL_LOGO || "/logo/srt-logo.svg";

  return (
    <HomeClient
      schoolName={schoolName}
      schoolLogo={schoolLogo}
      initialError={searchParams.error}
    />
  );
}
