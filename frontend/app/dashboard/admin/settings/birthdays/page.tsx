import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import {
  getBirthdaySettingsAction,
  getBirthdayDashboardDataAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import BirthdaySettingsClient from "./BirthdaySettingsClient";

export const dynamic = "force-dynamic";

export default async function BirthdaySettingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const [settings, dashboardMeta] = await Promise.all([
    getBirthdaySettingsAction(),
    getBirthdayDashboardDataAction(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BirthdaySettingsClient initialSettings={settings} dashboardMeta={dashboardMeta} />
    </div>
  );
}
