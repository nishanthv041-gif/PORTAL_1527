import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { isSettingsUnlockedServer, getOrCreateSettingsSecurity } from "@/backend/lib/settings/settingsSecurityConfig";
import { getSchoolInfo } from "@/backend/api/actions/dashboard/admin/settings/actions";
import SettingsUnlockGateClient from "@/frontend/components/settings/SettingsUnlockGateClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unlock Settings | School Portal",
  description: "Enter your settings password to access administrative configurations.",
};

export default async function AdminSettingsUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user?.role !== "ADMIN") {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  const returnUrl = resolvedParams?.returnUrl || "/dashboard/admin/settings";

  // Check if already unlocked
  const unlockStatus = await isSettingsUnlockedServer();
  if (unlockStatus.unlocked) {
    redirect(returnUrl);
  }

  const security = await getOrCreateSettingsSecurity();
  const schoolInfo = await getSchoolInfo(true);

  let remainingMinutes: number | undefined;
  if (security.lockedUntil && security.lockedUntil.getTime() > Date.now()) {
    remainingMinutes = Math.max(
      1,
      Math.ceil((security.lockedUntil.getTime() - Date.now()) / (60 * 1000))
    );
  }

  return (
    <SettingsUnlockGateClient
      initialLockedUntil={security.lockedUntil?.toISOString() || null}
      initialRemainingMinutes={remainingMinutes}
      returnUrl={returnUrl}
      schoolName={schoolInfo.SCHOOL_NAME || "SRT Universal School"}
      logoUrl={schoolInfo.SCHOOL_LOGO || "/logo.png"}
    />
  );
}

