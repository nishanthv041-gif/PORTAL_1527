import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import HomeClient from "./HomeClient";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

interface HomeProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home(props: HomeProps) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(getAuthOptions());

  if (session) {
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
    />
  );
}
