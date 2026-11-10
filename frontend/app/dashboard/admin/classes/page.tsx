import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ClassListClient from "./ClassListClient";
import Link from "next/link";
import { UserCheck, AlertTriangle } from "lucide-react";

export default async function AdminClassesPage() {
  const session = await getCachedServerSession();
  if (!session || session.user.role !== 'ADMIN') return null;

  const [classes, teachers, discrepancyCount] = await Promise.all([
    prisma.class.findMany({
      where: { isActive: true },
      include: {
        teacher: {
          include: { user: true }
        },
        students: {
          where: { isActive: true },
          include: {
            attendances: {
              select: {
                id: true,
                studentId: true,
                status: true,
                date: true,
                remarks: true,
                classId: true
              }
            }
          }
        }
      }
    }),
    prisma.teacher.findMany({
      where: { isActive: true },
      include: { user: true }
    }),
    prisma.class.count({
      where: {
        isActive: true,
        teacherId: { not: null },
        classTeacherId: null
      }
    })
  ]);

  return (
    <div className={styles.dashboard}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <h1 className={styles.title} style={{ marginBottom: 0 }}>Classes</h1>
        <Link
          href="/dashboard/admin/classes/reconciliation"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20 rounded-xl transition border border-primary/20"
        >
          <UserCheck size={16} />
          <span>Class Teacher Assignments</span>
          {discrepancyCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold bg-amber-500 text-white rounded-full">
              {discrepancyCount} needs sync
            </span>
          )}
        </Link>
      </div>

      {discrepancyCount > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600 shrink-0" size={20} />
            <p className="text-sm">
              <strong>{discrepancyCount} {discrepancyCount === 1 ? 'class has' : 'classes have'} legacy teacher assignments</strong> waiting for official Class Teacher confirmation (including Class 2 - A).
            </p>
          </div>
          <Link
            href="/dashboard/admin/classes/reconciliation"
            className="px-3.5 py-1.5 text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 rounded-lg shadow-sm transition"
          >
            Review & Confirm Now →
          </Link>
        </div>
      )}
      
      <ClassListClient classes={classes as any} teachers={teachers} />
    </div>
  );
}
