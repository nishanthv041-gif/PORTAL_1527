import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { redirect } from "next/navigation";
import { getBatchesAction, createBatchAction } from "@/backend/api/actions/dashboard/admin/batches/actions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import BatchManagementClient from "./BatchManagementClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Academic Batches & Student Promotion | School Portal",
  description: "Manage academic year batches, annual class advancement, and Class 12 alumni graduation."
};

export default async function AdminBatchesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  // Check if any batches exist. If not, auto-bootstrap default "25-26" batch and link active classes
  let batchData = await getBatchesAction();
  if (!batchData.batches || batchData.batches.length === 0) {
    const formData = new FormData();
    formData.set("name", "25-26");
    formData.set("academicYear", "Academic Session 2025-2026");
    formData.set("isCurrent", "true");
    formData.set("status", "ACTIVE");
    await createBatchAction(formData);

    batchData = await getBatchesAction();
  }

  const batches = batchData.batches || [];
  const currentBatch = batchData.currentBatch || null;
  const unassignedClasses = batchData.unassignedClasses || [];

  return (
    <div className={styles.dashboard}>
      <BatchManagementClient 
        batches={batches as any}
        currentBatch={currentBatch as any}
        unassignedClasses={unassignedClasses}
      />
    </div>
  );
}
