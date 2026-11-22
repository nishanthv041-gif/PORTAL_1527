import { getCachedServerSession } from "@/backend/auth/sessionCache";
import HomeClient from "./HomeClient";
import { getSystemSettings } from "@/backend/api/actions/dashboard/admin/settings/actions";

interface HomeProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home(props: HomeProps) {
  const searchParams = await props.searchParams;
  const session = await getCachedServerSession();

  let schoolName = "SRT UNIVERSAL SCHOOL";
  let schoolLogo = "/logo/srt-logo.svg";
  try {
    const settings = await Promise.race([
      getSystemSettings(),
      new Promise<Record<string, string>>((resolve) => setTimeout(() => resolve({}), 80)),
    ]);
    if (settings.SCHOOL_NAME) schoolName = settings.SCHOOL_NAME;
    if (settings.SCHOOL_LOGO) schoolLogo = settings.SCHOOL_LOGO;
  } catch {}

  // Pass active role (if any) to HomeClient so the full home animation plays reliably on every open and logout
  return (
    <HomeClient
      schoolName={schoolName}
      schoolLogo={schoolLogo}
      initialError={searchParams.error}
      authenticatedRole={session?.user?.role || null}
    />
  );
}
