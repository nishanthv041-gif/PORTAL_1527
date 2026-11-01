import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import HomeClient from "../HomeClient";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; reason?: string }>;
}

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(getAuthOptions());

  // If user has a valid active session and wasn't sent back with a logout/revocation reason, redirect to dashboard
  if (session && !searchParams.reason) {
    switch (session.user.role) {
      case "ADMIN":
        redirect("/dashboard/admin");
      case "TEACHER":
        redirect("/dashboard/teacher");
      case "PARENT":
        redirect("/dashboard/parent");
      case "STUDENT":
      default:
        redirect("/dashboard");
    }
  }

  const settings = await getSystemSettings();
  const schoolName = settings.SCHOOL_NAME || "SRT UNIVERSAL SCHOOL";
  const schoolLogo = settings.SCHOOL_LOGO || "/logo/srt-logo.svg";

  return (
    <HomeClient
      schoolName={schoolName}
      schoolLogo={schoolLogo}
      initialError={searchParams.error}
      initialReason={searchParams.reason}
    />
  );
}
