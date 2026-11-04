import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { redirect } from "next/navigation";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import SettingsClient from "./SettingsClient";
import { isSettingsUnlockedServer } from "@/backend/lib/settings/settingsSecurityConfig";
import { getBatchesAction, createBatchAction } from "@/backend/api/actions/dashboard/admin/batches/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Settings & Security | School Portal",
  description: "Configure school profile, academic batches, promotions, and settings master security.",
};

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getCachedServerSession();
  if (!session || session.user?.role !== "ADMIN") {
    redirect("/login");
  }

  // 1. Mandatory Server-Side Password Gate Enforcement
  const unlockStatus = await isSettingsUnlockedServer();
  if (!unlockStatus.unlocked) {
    const resolvedParams = await searchParams;
    const targetUrl = resolvedParams?.tab
      ? `/dashboard/admin/settings?tab=${resolvedParams.tab}`
      : "/dashboard/admin/settings";
    redirect(`/dashboard/admin/settings/unlock?returnUrl=${encodeURIComponent(targetUrl)}`);
  }

  const resolvedParams = await searchParams;
  const initialTab = resolvedParams?.tab || "info";

  // 2. Fetch System Settings
  const settings = await prisma.systemSetting.findMany({
    orderBy: { category: "asc" },
  });

  // 3. Fetch Batches & Promotion Data for Batches Tab
  let batchData = await getBatchesAction().catch(() => ({ batches: [], currentBatch: null, unassignedClasses: [] }));
  if (!batchData.batches || batchData.batches.length === 0) {
    try {
      const formData = new FormData();
      formData.set("name", "25-26");
      formData.set("academicYear", "Academic Session 2025-2026");
      formData.set("isCurrent", "true");
      formData.set("status", "ACTIVE");
      await createBatchAction(formData);
      batchData = await getBatchesAction();
    } catch {}
  }

  const batches = batchData.batches || [];
  const currentBatch = batchData.currentBatch || null;
  const unassignedClasses = batchData.unassignedClasses || [];

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ margin: 0, marginBottom: "1.25rem" }}>
        Admin Settings &amp; System Configuration
      </h1>

      <SettingsClient
        initialSettings={settings}
        batches={batches as any}
        currentBatch={currentBatch as any}
        unassignedClasses={unassignedClasses}
        initialTab={initialTab}
      />
    </div>
  );
}
