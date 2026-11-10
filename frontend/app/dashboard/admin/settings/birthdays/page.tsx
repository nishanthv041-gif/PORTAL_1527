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
import { Sliders } from "lucide-react";
import { CakeIcon as Cake } from "@/frontend/components/birthdays/BirthdayIcons";
import styles from "@/frontend/components/birthdays/BirthdayStudio.module.css";

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
    <div className={styles.adminPageWrapper}>
      {/* Top Switcher Navigation */}
      <div className={styles.adminHubNav}>
        <div>
          <h2 className={styles.adminHubTitle}>
            <Cake size={22} style={{ color: "#f59e0b" }} />
            <span>Birthday Celebrations Hub</span>
          </h2>
          <p className={styles.adminHubSubtitle}>
            Configure automated greetings, notification preferences, or view classroom celebrant studios.
          </p>
        </div>

        <div className={styles.adminSegmentControl}>
          <Link
            href="/dashboard/admin/settings/birthdays?view=settings"
            className={`${styles.adminSegmentBtn} ${viewMode === "settings" ? styles.adminSegmentBtnActive : ""}`}
          >
            <Sliders size={14} />
            <span>Settings &amp; Audit</span>
          </Link>
          <Link
            href="/dashboard/admin/settings/birthdays?view=classes"
            className={`${styles.adminSegmentBtn} ${viewMode === "classes" ? styles.adminSegmentBtnActive : ""}`}
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
