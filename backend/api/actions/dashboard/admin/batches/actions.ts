"use server";

import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { 
  simulateBatchPromotion, 
  executeBatchPromotionTransaction,
  ExecutePromotionInput 
} from "@/backend/lib/services/batchPromotionEngine";

// Verify admin authorization
async function requireAdmin() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized: Admin privileges required.");
  }
  return session.user;
}

// ----------------------------------------------------
// 1. GET ALL BATCHES & SUMMARY STATS
// ----------------------------------------------------
export async function getBatchesAction() {
  try {
    await requireAdmin();

    // Auto-sync any classes whose active students belong to a registered batch name
    const allBatchesBasic = await prisma.academicBatch.findMany({ select: { id: true, name: true } });
    for (const b of allBatchesBasic) {
      const mismatchedClasses = await prisma.class.findMany({
        where: {
          isActive: true,
          students: { some: { isActive: true, batch: b.name, enrollmentStatus: { not: "GRADUATED" } } },
          OR: [
            { batchId: null },
            { batchId: { not: b.id } }
          ]
        },
        select: { id: true }
      });

      if (mismatchedClasses.length > 0) {
        await prisma.class.updateMany({
          where: { id: { in: mismatchedClasses.map(c => c.id) } },
          data: { batchId: b.id }
        });
      }
    }

    const batches = await prisma.academicBatch.findMany({
      orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
      include: {
        classes: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            section: true,
            _count: {
              select: {
                students: { where: { isActive: true, enrollmentStatus: { not: "GRADUATED" } } }
              }
            }
          }
        },
        _count: {
          select: {
            promotionsFrom: true,
            promotionsTo: true
          }
        }
      }
    });

    const currentBatch = batches.find(b => b.isCurrent) || batches[0] || null;

    // Fetch classes without a batch for easy assignment
    const unassignedClasses = await prisma.class.findMany({
      where: { isActive: true, batchId: null },
      select: { id: true, name: true, section: true }
    });

    return {
      success: true,
      batches,
      currentBatch,
      unassignedClasses
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to load batches."
    };
  }
}

// ----------------------------------------------------
// 2. CREATE NEW BATCH
// ----------------------------------------------------
export async function createBatchAction(formData: FormData) {
  try {
    await requireAdmin();

    const name = String(formData.get("name") || "").trim();
    const academicYear = String(formData.get("academicYear") || name).trim();
    const isCurrent = formData.get("isCurrent") === "true";
    const status = String(formData.get("status") || "ACTIVE").trim().toUpperCase();

    const startDateStr = formData.get("startDate") as string;
    const endDateStr = formData.get("endDate") as string;

    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;

    if (!name) {
      return { success: false, error: "Batch name is required (e.g. '25-26' or '2025-2026')." };
    }

    const existing = await prisma.academicBatch.findUnique({
      where: { name }
    });

    if (existing) {
      return { success: false, error: `Batch with name '${name}' already exists.` };
    }

    // If marked current, unset current on other batches
    if (isCurrent) {
      await prisma.academicBatch.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false }
      });
    }

    const created = await prisma.academicBatch.create({
      data: {
        name,
        academicYear,
        startDate,
        endDate,
        isCurrent,
        status
      }
    });

    // Auto-link any unlinked classes to this batch if it's the first or active batch
    const unlinkedClasses = await prisma.class.findMany({
      where: { batchId: null, isActive: true },
      select: { id: true }
    });

    if (unlinkedClasses.length > 0 && isCurrent) {
      await prisma.class.updateMany({
        where: { id: { in: unlinkedClasses.map(c => c.id) } },
        data: { batchId: created.id }
      });
    }

    revalidatePath("/dashboard/admin/batches");
    revalidatePath("/dashboard/admin/classes");
    return { success: true, batch: created };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to create batch." };
  }
}

// ----------------------------------------------------
// 3. SET ACTIVE CURRENT BATCH
// ----------------------------------------------------
export async function setCurrentBatchAction(batchId: string) {
  try {
    await requireAdmin();

    await prisma.$transaction([
      prisma.academicBatch.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false }
      }),
      prisma.academicBatch.update({
        where: { id: batchId },
        data: { isCurrent: true, status: "ACTIVE" }
      })
    ]);

    revalidatePath("/dashboard/admin/batches");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to set current batch." };
  }
}

// ----------------------------------------------------
// 4. ASSIGN CLASSES TO BATCH
// ----------------------------------------------------
export async function assignClassesToBatchAction(batchId: string, classIds: string[]) {
  try {
    await requireAdmin();

    if (!batchId || classIds.length === 0) {
      return { success: false, error: "Batch ID and classes are required." };
    }

    await prisma.class.updateMany({
      where: { id: { in: classIds } },
      data: { batchId }
    });

    revalidatePath("/dashboard/admin/batches");
    revalidatePath("/dashboard/admin/classes");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to assign classes to batch." };
  }
}

// ----------------------------------------------------
// 5. SIMULATE BATCH PROMOTION PREVIEW
// ----------------------------------------------------
export async function simulateBatchPromotionAction(
  sourceBatchId: string,
  targetBatchId: string,
  terminalGrade: number = 12
) {
  try {
    await requireAdmin();

    if (!sourceBatchId || !targetBatchId) {
      return { success: false, error: "Source batch and Target batch are required." };
    }

    if (sourceBatchId === targetBatchId) {
      return { success: false, error: "Source and Target batches must be different." };
    }

    const simulation = await simulateBatchPromotion(sourceBatchId, targetBatchId, terminalGrade);

    return {
      success: true,
      simulation
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to simulate promotion." };
  }
}

// ----------------------------------------------------
// 6. EXECUTE ATOMIC BATCH PROMOTION
// ----------------------------------------------------
export async function executeBatchPromotionAction(input: {
  sourceBatchId: string;
  targetBatchId: string;
  studentOverrides?: Record<string, "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER">;
  terminalGrade?: number;
}) {
  try {
    const admin = await requireAdmin();

    const promotionInput: ExecutePromotionInput = {
      sourceBatchId: input.sourceBatchId,
      targetBatchId: input.targetBatchId,
      studentOverrides: input.studentOverrides || {},
      authorizedById: admin.id,
      terminalGrade: input.terminalGrade || 12
    };

    const result = await executeBatchPromotionTransaction(promotionInput);

    revalidatePath("/dashboard/admin/batches");
    revalidatePath("/dashboard/admin/classes");
    revalidatePath("/dashboard/admin/students");
    revalidatePath("/dashboard/admin");

    return {
      success: true,
      result
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to execute batch promotion."
    };
  }
}

// ----------------------------------------------------
// 7. GET GRADUATED STUDENTS (ALUMNI DIRECTORY)
// ----------------------------------------------------
export async function getGraduatedStudentsAction(batchFilter?: string, searchQuery?: string) {
  try {
    await requireAdmin();

    const whereClause: any = {
      enrollmentStatus: "GRADUATED"
    };

    if (batchFilter && batchFilter !== "ALL") {
      whereClause.graduationBatch = batchFilter;
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      whereClause.OR = [
        { rollNumber: { contains: q, mode: "insensitive" } },
        { admissionNo: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } }
      ];
    }

    const [graduatedStudents, availableBatches] = await Promise.all([
      prisma.student.findMany({
        where: whereClause,
        orderBy: [{ graduatedAt: "desc" }, { rollNumber: "asc" }],
        include: {
          parents: {
            include: {
              parent: {
                include: { user: true }
              }
            }
          },
          promotions: {
            where: { action: "GRADUATED" },
            take: 1
          }
        }
      }),
      prisma.student.findMany({
        where: { enrollmentStatus: "GRADUATED", graduationBatch: { not: null } },
        distinct: ["graduationBatch"],
        select: { graduationBatch: true }
      })
    ]);

    return {
      success: true,
      graduatedStudents,
      graduationBatches: availableBatches.map(b => b.graduationBatch!).filter(Boolean)
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to load graduated students."
    };
  }
}

// ----------------------------------------------------
// 8. GET PROMOTION AUDIT HISTORY
// ----------------------------------------------------
export async function getPromotionAuditHistoryAction() {
  try {
    await requireAdmin();

    const history = await prisma.promotionAudit.findMany({
      orderBy: { promotedAt: "desc" },
      take: 100,
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            admissionNo: true
          }
        }
      }
    });

    return {
      success: true,
      history
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to load promotion history."
    };
  }
}

// ----------------------------------------------------
// 9. UPDATE BATCH DETAILS & DATES
// ----------------------------------------------------
export async function updateBatchDatesAction(input: {
  batchId: string;
  name?: string;
  academicYear?: string;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
}) {
  try {
    await requireAdmin();

    const data: any = {};
    if (input.name && input.name.trim()) data.name = input.name.trim();
    if (input.academicYear !== undefined) data.academicYear = input.academicYear?.trim() || null;
    if (input.status) data.status = input.status.trim().toUpperCase();

    if (input.startDate !== undefined) {
      data.startDate = input.startDate ? new Date(input.startDate) : null;
    }
    if (input.endDate !== undefined) {
      data.endDate = input.endDate ? new Date(input.endDate) : null;
    }

    const updated = await prisma.academicBatch.update({
      where: { id: input.batchId },
      data
    });

    revalidatePath("/dashboard/admin/batches");
    revalidatePath("/dashboard/admin");
    return { success: true, batch: updated };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update batch dates." };
  }
}

// ----------------------------------------------------
// 10. DELETE ACADEMIC BATCH
// ----------------------------------------------------
export async function deleteBatchAction(batchId: string) {
  try {
    await requireAdmin();

    const batch = await prisma.academicBatch.findUnique({
      where: { id: batchId },
      include: { classes: true }
    });

    if (!batch) {
      return { success: false, error: "Batch not found." };
    }

    // Safely unassign linked classes so no class or student data is lost
    await prisma.class.updateMany({
      where: { batchId },
      data: { batchId: null }
    });

    // Remove promotion audits referring to this batch
    await prisma.promotionAudit.deleteMany({
      where: {
        OR: [
          { fromBatchId: batchId },
          { toBatchId: batchId }
        ]
      }
    });

    // If deleting the current active batch, set another remaining batch as current
    if (batch.isCurrent) {
      const remaining = await prisma.academicBatch.findFirst({
        where: { id: { not: batchId } },
        orderBy: { createdAt: "desc" }
      });
      if (remaining) {
        await prisma.academicBatch.update({
          where: { id: remaining.id },
          data: { isCurrent: true, status: "ACTIVE" }
        });
      }
    }

    await prisma.academicBatch.delete({
      where: { id: batchId }
    });

    revalidatePath("/dashboard/admin/batches");
    revalidatePath("/dashboard/admin/classes");
    revalidatePath("/dashboard/admin/students");
    revalidatePath("/dashboard/admin");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete batch." };
  }
}

