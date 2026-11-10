import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import {
  getBirthdaySettingsAction,
  getBirthdayDashboardDataAction,
  getClassBirthdayWishesSummaryAction,
} from "@/backend/api/actions/dashboard/admin/birthdays/actions";
import { getAuthorizedBirthdayClasses } from "@/lib/teacher/classAccess";
import BirthdaySettingsClient from "./BirthdaySettingsClient";
import BirthdayWishesStudio from "@/frontend/components/birthdays/BirthdayWishesStudio";
import Link from "next/link";
import { Sparkles, Sliders } from "lucide-react";
import { CakeIcon as Cake } from "@/frontend/components/birthdays/BirthdayIcons";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ view?: string; classId?: string }>;
}

export default async function BirthdaySettingsPage(props: PageProps) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  const searchParams = props.searchParams ? await props.searchParams : {};
  const viewMode = searchParams.view || "settings"; // 'settings' or 'classes'

  const [settings, dashboardMeta, authClasses] = await Promise.all([
    getBirthdaySettingsAction(),
    getBirthdayDashboardDataAction(),
    getAuthorizedBirthdayClasses(),
  ]);

  const activeClassId =
    searchParams.classId ||
    authClasses.selectedClassId ||
    authClasses.classes[0]?.classId ||
    "";

  let classSummary = null;
  if (activeClassId && viewMode === "classes") {
    try {
      classSummary = await getClassBirthdayWishesSummaryAction(activeClassId);
    } catch {}
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Switcher Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles size={20} className="text-amber-500" />
            <span>Universal Birthday Center</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure automated greetings, notification templates, or inspect classroom celebrant studios.
          </p>
        </div>

        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <Link
            href="/dashboard/admin/settings/birthdays?view=settings"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === "settings"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Sliders size={14} />
            <span>Settings &amp; Audit</span>
          </Link>
          <Link
            href="/dashboard/admin/settings/birthdays?view=classes"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === "classes"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Cake size={14} />
            <span>Classroom Studio</span>
          </Link>
        </div>
      </div>

      {viewMode === "classes" && classSummary ? (
        <BirthdayWishesStudio
          userRole="ADMIN"
          classes={authClasses.classes}
          selectedClassId={activeClassId}
          className={classSummary.className}
          todayCelebrants={classSummary.todayCelebrants}
          upcoming7Days={classSummary.upcoming7Days}
          upcoming30Days={classSummary.upcoming30Days}
          totalCelebrantsThisMonth={classSummary.totalCelebrantsThisMonth}
          missingDobCount={classSummary.missingDobCount}
          totalStudents={classSummary.totalStudents}
          settings={classSummary.settings}
        />
      ) : (
        <BirthdaySettingsClient initialSettings={settings} dashboardMeta={dashboardMeta} />
      )}
    </div>
  );
}
