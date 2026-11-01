"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";
import {
  CreateBusSchema,
  UpdateBusSchema,
  AssignStudentsSchema,
  UpdateBusStatusSchema,
  SendBusMessageSchema,
} from "@/backend/lib/validations/transport";

// Helper: resolve staff record for current session user (supports STAFF and TEACHER roles)
async function getStaffForUser(userId: string) {
  let staff = await prisma.staff.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!staff) {
    // If user is a teacher, auto-provision or link staff record
    const teacher = await prisma.teacher.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (teacher) {
      staff = await prisma.staff.create({
        data: {
          userId,
          phone: teacher.phone,
          designation: "Teacher & Bus In-charge",
          isActive: true,
        },
        include: { user: true },
      });
    }
  }

  return staff;
}

// ==========================================
// 1. GET TRANSPORT OVERVIEW FOR ADMIN
// ==========================================
export async function getTransportOverviewAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return { error: "Unauthorized access." };
    }

    // 1. Fetch all buses with enrolled count, in-charge staff, and latest logs
    const buses = await prisma.bus.findMany({
      orderBy: { busNumber: "asc" },
      include: {
        inChargeStaff: {
          select: {
            id: true,
            phone: true,
            designation: true,
            isActive: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
        statusLogs: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    // 2. Fetch available active staff members for in-charge assignment
    // Also include teachers by ensuring they have staff records
    const staffList = await prisma.staff.findMany({
      where: { isActive: true },
      select: {
        id: true,
        phone: true,
        designation: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    // 3. Fetch active classes with students for the assignment picker
    const classes = await prisma.class.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        section: true,
        students: {
          where: { isActive: true },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            admissionNo: true,
            classId: true,
            residenceType: true,
            busAssignments: {
              select: {
                id: true,
                busId: true,
                academicYear: true,
                pickupPoint: true,
                dropPoint: true,
                bus: {
                  select: {
                    id: true,
                    busNumber: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    // 4. Fetch recent bus messages across the fleet
    const recentMessages = await prisma.busMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        bus: {
          select: {
            busNumber: true,
            name: true,
          },
        },
        senderStaff: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    // 5. Fetch recent status logs
    const recentStatusLogs = await prisma.busStatusLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        bus: {
          select: {
            busNumber: true,
            name: true,
          },
        },
        reportedByStaff: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: {
        buses,
        staffList,
        classes,
        recentMessages,
        recentStatusLogs,
      },
    };
  } catch (error: any) {
    console.error("Error fetching transport overview:", error);
    return { error: error?.message || "Failed to load transport details." };
  }
}

// ==========================================
// 2. GET SINGLE BUS DETAIL
// ==========================================
export async function getBusDetailAction(busId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return { error: "Unauthorized access." };
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        inChargeStaff: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        students: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                rollNumber: true,
                admissionNo: true,
                residenceType: true,
                class: {
                  select: {
                    id: true,
                    name: true,
                    section: true,
                  },
                },
                parents: {
                  include: {
                    parent: {
                      select: {
                        id: true,
                        phone: true,
                        alternatePhone: true,
                        user: {
                          select: {
                            id: true,
                            name: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            student: {
              firstName: "asc",
            },
          },
        },
        statusLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            reportedByStaff: {
              include: { user: { select: { name: true } } },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            senderStaff: {
              include: { user: { select: { name: true } } },
            },
            targetStudent: {
              select: {
                firstName: true,
                lastName: true,
                rollNumber: true,
              },
            },
          },
        },
      },
    });

    if (!bus) {
      return { error: "Bus not found." };
    }

    // Role check: If user is STAFF/TEACHER and not ADMIN, they can only view their own assigned bus
    if (session.user.role !== "ADMIN") {
      const userStaff = await getStaffForUser(session.user.id);
      if (!userStaff || bus.inChargeStaffId !== userStaff.id) {
        return { error: "Access denied: You are not the assigned in-charge for this bus." };
      }
    }

    return { success: true, bus };
  } catch (error: any) {
    console.error("Error fetching bus detail:", error);
    return { error: error?.message || "Failed to load bus details." };
  }
}

// ==========================================
// 3. CREATE NEW BUS (ADMIN ONLY)
// ==========================================
export async function createBusAction(rawData: any) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Administrator privileges required." };
    }

    // Validate with Zod
    const parsed = CreateBusSchema.safeParse(rawData);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Validation failed.";
      return { error: firstError };
    }

    const data = parsed.data;

    // Check unique busNumber
    const existing = await prisma.bus.findUnique({
      where: { busNumber: data.busNumber },
    });
    if (existing) {
      return { error: `Bus Number "${data.busNumber}" is already registered.` };
    }

    // Verify inChargeStaffId is an active staff member if provided
    if (data.inChargeStaffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: data.inChargeStaffId },
      });
      if (!staff || !staff.isActive) {
        return { error: "The selected in-charge staff member is not active or does not exist." };
      }
    }

    const bus = await prisma.bus.create({
      data: {
        busNumber: data.busNumber,
        registrationNo: data.registrationNo.toUpperCase(),
        name: data.name,
        capacity: data.capacity,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        routeDescription: data.routeDescription || null,
        status: data.status,
        inChargeStaffId: data.inChargeStaffId || null,
        isActive: data.isActive,
      },
      include: {
        inChargeStaff: {
          include: { user: true },
        },
      },
    });

    // Create initial status log
    if (data.inChargeStaffId) {
      await prisma.busStatusLog.create({
        data: {
          busId: bus.id,
          status: bus.status,
          issueType: null,
          description: `Bus ${bus.busNumber} registered into school fleet.`,
          reportedByStaffId: data.inChargeStaffId,
        },
      });
    }

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/staff/my-bus");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");

    return { success: true, bus };
  } catch (error: any) {
    console.error("Error creating bus:", error);
    return { error: error?.message || "Failed to create bus." };
  }
}

// ==========================================
// 4. UPDATE BUS DETAILS (ADMIN ONLY)
// ==========================================
export async function updateBusAction(busId: string, rawData: any) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Administrator privileges required." };
    }

    const parsed = UpdateBusSchema.safeParse(rawData);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Validation failed.";
      return { error: firstError };
    }

    const data = parsed.data;

    const existingBus = await prisma.bus.findUnique({
      where: { id: busId },
      include: { _count: { select: { students: true } } },
    });
    if (!existingBus) {
      return { error: "Bus not found." };
    }

    // Bus number conflict check
    if (data.busNumber && data.busNumber !== existingBus.busNumber) {
      const conflict = await prisma.bus.findUnique({
        where: { busNumber: data.busNumber },
      });
      if (conflict) {
        return { error: `Bus Number "${data.busNumber}" is already in use.` };
      }
    }

    // Capacity check: capacity cannot be less than currently enrolled students
    if (data.capacity !== undefined && data.capacity < existingBus._count.students) {
      return {
        error: `Cannot reduce capacity to ${data.capacity}. There are currently ${existingBus._count.students} students enrolled on this bus.`,
      };
    }

    // Active staff check
    if (data.inChargeStaffId && data.inChargeStaffId !== existingBus.inChargeStaffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: data.inChargeStaffId },
      });
      if (!staff || !staff.isActive) {
        return { error: "The selected in-charge staff member is not active or does not exist." };
      }
    }

    const updated = await prisma.bus.update({
      where: { id: busId },
      data: {
        ...(data.busNumber ? { busNumber: data.busNumber } : {}),
        ...(data.registrationNo ? { registrationNo: data.registrationNo.toUpperCase() } : {}),
        ...(data.name ? { name: data.name } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.driverName ? { driverName: data.driverName } : {}),
        ...(data.driverPhone ? { driverPhone: data.driverPhone } : {}),
        ...(data.routeDescription !== undefined ? { routeDescription: data.routeDescription } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.inChargeStaffId !== undefined ? { inChargeStaffId: data.inChargeStaffId } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/staff/my-bus");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");

    return { success: true, bus: updated };
  } catch (error: any) {
    console.error("Error updating bus:", error);
    return { error: error?.message || "Failed to update bus." };
  }
}

// ==========================================
// 5. DELETE BUS (ADMIN ONLY - SAFE UNASSIGNMENT)
// ==========================================
export async function deleteBusAction(busId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Administrator privileges required." };
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: { _count: { select: { students: true } } },
    });
    if (!bus) return { error: "Bus not found." };

    // Safely delete bus (cascade removes assignments, logs and messages cleanly without deleting students or staff)
    await prisma.bus.delete({
      where: { id: busId },
    });

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/staff/my-bus");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");

    return {
      success: true,
      message: `Bus ${bus.busNumber} removed safely. Unassigned ${bus._count.students} students.`,
    };
  } catch (error: any) {
    console.error("Error deleting bus:", error);
    return { error: error?.message || "Failed to delete bus." };
  }
}

// ==========================================
// 6. ASSIGN STUDENTS TO BUS (SINGLE & BULK)
// ==========================================
export async function assignStudentsToBusAction(busId: string, rawPayload: any) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Only administrators can assign students to buses." };
    }

    // Support both direct array or { students, academicYear } format
    const formattedPayload = Array.isArray(rawPayload)
      ? { students: rawPayload, academicYear: "2025-2026" }
      : rawPayload;

    const parsed = AssignStudentsSchema.safeParse(formattedPayload);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid student assignment data.";
      return { error: firstError };
    }

    const { students: assignments, academicYear } = parsed.data;

    // Check bus existence and capacity
    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        students: {
          where: { academicYear },
          select: { studentId: true },
        },
      },
    });

    if (!bus) return { error: "Bus not found." };
    if (!bus.isActive) return { error: "Cannot assign students to an inactive bus." };

    const currentAssignedCount = bus.students.length;
    const currentlyEnrolledIds = new Set(bus.students.map((s) => s.studentId));

    // Calculate how many NEW students are being added
    const newStudentsCount = assignments.filter((a) => !currentlyEnrolledIds.has(a.studentId)).length;

    if (currentAssignedCount + newStudentsCount > bus.capacity) {
      return {
        error: `Cannot assign students: Bus capacity of ${bus.capacity} would be exceeded. Current enrolled: ${currentAssignedCount}, attempting to add: ${newStudentsCount}. Available seats: ${Math.max(0, bus.capacity - currentAssignedCount)}.`,
      };
    }

    // Check if any student is ALREADY assigned to ANOTHER bus in the same academic year
    const studentIds = assignments.map((a) => a.studentId);
    const existingOtherAssignments = await prisma.busStudent.findMany({
      where: {
        studentId: { in: studentIds },
        academicYear,
        busId: { not: busId },
      },
      include: {
        student: { select: { firstName: true, lastName: true, rollNumber: true } },
        bus: { select: { busNumber: true, name: true } },
      },
    });

    if (existingOtherAssignments.length > 0) {
      const conflict = existingOtherAssignments[0];
      return {
        error: `Student ${conflict.student.firstName} ${conflict.student.lastName} (Roll: ${conflict.student.rollNumber}) is already assigned to ${conflict.bus.busNumber} (${conflict.bus.name}) for ${academicYear}. A student can belong to only ONE bus at a time. Please unassign them from ${conflict.bus.busNumber} first.`,
      };
    }

    // Upsert assignments inside a single transaction
    await prisma.$transaction(async (tx) => {
      for (const item of assignments) {
        await tx.busStudent.upsert({
          where: {
            studentId_academicYear: {
              studentId: item.studentId,
              academicYear,
            },
          },
          update: {
            busId,
            pickupPoint: item.pickupPoint || null,
            dropPoint: item.dropPoint || null,
            assignedAt: new Date(),
          },
          create: {
            busId,
            studentId: item.studentId,
            academicYear,
            pickupPoint: item.pickupPoint || null,
            dropPoint: item.dropPoint || null,
          },
        });
      }
    });

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");

    return {
      success: true,
      count: assignments.length,
      message: `Successfully assigned ${assignments.length} student${assignments.length === 1 ? "" : "s"} to Bus ${bus.busNumber}.`,
    };
  } catch (error: any) {
    console.error("Error assigning students to bus:", error);
    return { error: error?.message || "Failed to assign students." };
  }
}

// ==========================================
// 7. REMOVE STUDENT FROM BUS
// ==========================================
export async function removeStudentFromBusAction(busStudentIdOrBusId: string, maybeStudentId?: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Administrator privileges required." };
    }

    let assignment;
    if (maybeStudentId) {
      assignment = await prisma.busStudent.findFirst({
        where: { busId: busStudentIdOrBusId, studentId: maybeStudentId },
        include: {
          student: { select: { firstName: true, lastName: true } },
          bus: { select: { busNumber: true } },
        },
      });
    } else {
      assignment = await prisma.busStudent.findUnique({
        where: { id: busStudentIdOrBusId },
        include: {
          student: { select: { firstName: true, lastName: true } },
          bus: { select: { busNumber: true } },
        },
      });
    }

    if (!assignment) {
      return { error: "Student bus assignment record not found." };
    }

    // Delete ONLY the BusStudent assignment (student record is preserved)
    await prisma.busStudent.delete({
      where: { id: assignment.id },
    });

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");

    return {
      success: true,
      message: `${assignment.student.firstName} ${assignment.student.lastName} unassigned from Bus ${assignment.bus.busNumber}.`,
    };
  } catch (error: any) {
    console.error("Error unassigning student from bus:", error);
    return { error: error?.message || "Failed to unassign student." };
  }
}

// ==========================================
// 8. UPDATE BUS STATUS & REPORT ISSUES
// ==========================================
export async function updateBusStatusAction(busId: string, rawPayload: any) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return { error: "Unauthorized access." };
    }

    const parsed = UpdateBusStatusSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid status payload.";
      return { error: firstError };
    }

    const { status, issueType, description } = parsed.data;

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        inChargeStaff: { include: { user: true } },
      },
    });
    if (!bus) return { error: "Bus not found." };

    // Permission check: If user is not ADMIN, verify they are the in-charge staff for this bus
    const userStaff = await getStaffForUser(session.user.id);
    if (session.user.role !== "ADMIN") {
      if (!userStaff || bus.inChargeStaffId !== userStaff.id) {
        return { error: "Permission denied: You can only report status for buses assigned to you." };
      }
    }

    const staffIdForLog = userStaff?.id || bus.inChargeStaffId || null;

    // 1. Update bus status and create log
    const updatedBus = await prisma.bus.update({
      where: { id: busId },
      data: { status },
    });

    const statusLog = await prisma.busStatusLog.create({
      data: {
        busId,
        status,
        issueType: issueType || null,
        description,
        reportedByStaffId: staffIdForLog,
      },
    });

    // 2. AUTOMATIC URGENT PARENT NOTIFICATION IF STATUS != 'RUNNING'
    let parentAlertCount = 0;
    if (status !== "RUNNING") {
      // Find all parents of active students on this bus
      const busStudents = await prisma.busStudent.findMany({
        where: { busId },
        select: {
          student: {
            select: {
              firstName: true,
              parents: {
                select: {
                  parent: {
                    select: {
                      userId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const parentUserIds: string[] = [];
      for (const bs of busStudents) {
        for (const p of bs.student.parents) {
          if (p.parent?.userId && !parentUserIds.includes(p.parent.userId)) {
            parentUserIds.push(p.parent.userId);
          }
        }
      }

      if (parentUserIds.length > 0) {
        const statusLabel =
          status === "DELAYED"
            ? "⏱️ Transit Delay Alert"
            : status === "NOT_RUNNING"
            ? "⚠️ Bus Service Interruption"
            : "🔧 Maintenance Transit Alert";

        const notifTitle = `${statusLabel}: Bus ${bus.busNumber}`;
        const notifContent = `Bus ${bus.busNumber} (${bus.name}) status update: ${description}. Please review live transport details.`;

        // Batch insert inside database
        await prisma.notification.createMany({
          data: parentUserIds.map((userId) => ({
            userId,
            title: notifTitle,
            content: notifContent,
            type: "BUS",
            category: "BUS",
            priority: "URGENT",
            link: "/parent/bus",
            isRead: false,
          })),
        });

        // Invalidate cache for immediate delivery
        for (const uid of parentUserIds) {
          invalidateUserNotifCache(uid);
        }

        parentAlertCount = parentUserIds.length;
      }
    }

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/staff/my-bus");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");
    revalidatePath("/dashboard/parent/notifications");

    return {
      success: true,
      bus: updatedBus,
      log: statusLog,
      parentAlertCount,
      message: `Bus status updated to ${status}.${parentAlertCount > 0 ? ` Automatically dispatched urgent alert to ${parentAlertCount} parent accounts.` : ""}`,
    };
  } catch (error: any) {
    console.error("Error updating bus status:", error);
    return { error: error?.message || "Failed to update bus status." };
  }
}

// ==========================================
// 9. SEND BUS MESSAGE (COMMON OR INDIVIDUAL)
// In a single Prisma Transaction
// ==========================================
export async function sendBusMessageAction(busId: string, rawPayload: any) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return { error: "Unauthorized access." };
    }

    const parsed = SendBusMessageSchema.safeParse(rawPayload);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid message payload.";
      return { error: firstError };
    }

    const { type, title, message, priority, targetStudentId } = parsed.data;

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: {
        inChargeStaff: { include: { user: true } },
      },
    });
    if (!bus) return { error: "Bus not found." };

    // Role check: Admin can send for any bus; Staff can send only for their assigned bus
    const userStaff = await getStaffForUser(session.user.id);
    if (session.user.role !== "ADMIN") {
      if (!userStaff || bus.inChargeStaffId !== userStaff.id) {
        return { error: "Permission denied: You can only broadcast messages for your assigned bus." };
      }
    }

    const staffIdForMessage = userStaff?.id || bus.inChargeStaffId || null;

    // Resolve target recipient parent user IDs
    let targetParentUserIds: string[] = [];

    if (type === "COMMON") {
      // Common message: sends to every parent of every student on that bus
      const busStudents = await prisma.busStudent.findMany({
        where: { busId },
        select: {
          student: {
            select: {
              parents: {
                select: {
                  parent: {
                    select: {
                      userId: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      for (const bs of busStudents) {
        for (const p of bs.student.parents) {
          if (p.parent?.userId && !targetParentUserIds.includes(p.parent.userId)) {
            targetParentUserIds.push(p.parent.userId);
          }
        }
      }
    } else if (type === "INDIVIDUAL") {
      if (!targetStudentId) {
        return { error: "Target student must be selected for an individual message." };
      }

      // Verify that this student is actually assigned to this bus
      const isStudentOnBus = await prisma.busStudent.findFirst({
        where: { busId, studentId: targetStudentId },
      });
      if (!isStudentOnBus) {
        return { error: "Selected student is not enrolled on this bus." };
      }

      const parentStudents = await prisma.parentStudent.findMany({
        where: { studentId: targetStudentId },
        select: {
          parent: {
            select: {
              userId: true,
            },
          },
        },
      });

      for (const ps of parentStudents) {
        if (ps.parent?.userId && !targetParentUserIds.includes(ps.parent.userId)) {
          targetParentUserIds.push(ps.parent.userId);
        }
      }
    }

    // CREATE BUS MESSAGE + ALL NOTIFICATION ROWS INSIDE ONE PRISMA TRANSACTION
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create BusMessage record
      const busMessage = await tx.busMessage.create({
        data: {
          busId,
          senderStaffId: staffIdForMessage,
          type,
          title: title.trim(),
          message: message.trim(),
          priority,
          targetStudentId: type === "INDIVIDUAL" ? targetStudentId : null,
        },
      });

      // 2. Insert Notification rows for all target parent users
      if (targetParentUserIds.length > 0) {
        const notifIcon = priority === "URGENT" ? "🚨 " : "🚌 ";
        const formattedTitle = `${notifIcon}Bus ${bus.busNumber}: ${title.trim()}`;

        await tx.notification.createMany({
          data: targetParentUserIds.map((userId) => ({
            userId,
            title: formattedTitle,
            content: message.trim(),
            type: "BUS",
            category: "BUS",
            priority,
            link: "/parent/bus",
            isRead: false,
          })),
        });
      }

      return busMessage;
    });

    // Invalidate user notification caches
    for (const uid of targetParentUserIds) {
      invalidateUserNotifCache(uid);
    }

    revalidatePath("/admin/buses");
    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/staff/my-bus");
    revalidatePath("/parent/bus");
    revalidatePath("/dashboard/parent/transport");
    revalidatePath("/dashboard/parent/notifications");

    return {
      success: true,
      busMessage: result,
      recipientCount: targetParentUserIds.length,
      message: `Message dispatched successfully to ${targetParentUserIds.length} parent account${targetParentUserIds.length === 1 ? "" : "s"}.`,
    };
  } catch (error: any) {
    console.error("Error sending bus message:", error);
    return { error: error?.message || "Failed to dispatch bus message." };
  }
}

// ==========================================
// 10. GET BUSES FOR STAFF IN-CHARGE
// ==========================================
export async function getStaffAssignedBusesAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER", "STAFF", "NON_TEACHING_STAFF"].includes(session.user.role)) {
      return { error: "Unauthorized access: Staff/Teacher role required." };
    }

    const staff = await getStaffForUser(session.user.id);
    if (!staff && session.user.role !== "ADMIN") {
      return { success: true, buses: [] };
    }

    const whereClause: any = { isActive: true };
    if (session.user.role !== "ADMIN" && staff) {
      whereClause.inChargeStaffId = staff.id;
    }

    const buses = await prisma.bus.findMany({
      where: whereClause,
      include: {
        inChargeStaff: {
          include: { user: { select: { name: true, email: true } } },
        },
        _count: {
          select: { students: true },
        },
        students: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                rollNumber: true,
                admissionNo: true,
                residenceType: true,
                class: { select: { name: true, section: true } },
                parents: {
                  include: {
                    parent: {
                      select: {
                        phone: true,
                        user: { select: { name: true } },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { student: { firstName: "asc" } },
        },
        statusLogs: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
      orderBy: { busNumber: "asc" },
    });

    return { success: true, buses, staffId: staff?.id || null };
  } catch (error: any) {
    console.error("Error fetching staff assigned buses:", error);
    return { error: error?.message || "Failed to load assigned buses." };
  }
}

// ==========================================
// 11. GET PARENT BUS OVERVIEW (READ-ONLY)
// ==========================================
export async function getParentBusOverviewAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "PARENT") {
      return { error: "Unauthorized access: Parent portal only." };
    }

    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: true,
                busAssignments: {
                  include: {
                    bus: {
                      include: {
                        inChargeStaff: {
                          include: {
                            user: {
                              select: {
                                name: true,
                                email: true,
                              },
                            },
                          },
                        },
                        statusLogs: {
                          orderBy: { createdAt: "desc" },
                          take: 5,
                        },
                        messages: {
                          orderBy: { createdAt: "desc" },
                          take: 10,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return { error: "Parent profile not found." };
    }

    const childrenTransport = parent.children.map((childRel) => {
      const student = childRel.student;
      const assignment = student.busAssignments[0] || null;

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        rollNumber: student.rollNumber,
        admissionNo: student.admissionNo,
        className: student.class ? `${student.class.name} - ${student.class.section}` : "N/A",
        hasBus: !!assignment,
        busDetails: assignment
          ? {
              assignmentId: assignment.id,
              busId: assignment.bus.id,
              busNumber: assignment.bus.busNumber,
              registrationNo: assignment.bus.registrationNo,
              name: assignment.bus.name,
              routeDescription: assignment.bus.routeDescription,
              status: assignment.bus.status,
              driverName: assignment.bus.driverName,
              driverPhone: assignment.bus.driverPhone,
              inChargeStaffName: assignment.bus.inChargeStaff?.user?.name || "Transport Desk",
              inChargeStaffPhone: assignment.bus.inChargeStaff?.phone || "Office Extension",
              pickupPoint: assignment.pickupPoint,
              dropPoint: assignment.dropPoint,
              academicYear: assignment.academicYear,
              recentStatusLogs: assignment.bus.statusLogs,
              recentMessages: assignment.bus.messages,
            }
          : null,
      };
    });

    return { success: true, children: childrenTransport };
  } catch (error: any) {
    console.error("Error fetching parent bus details:", error);
    return { error: error?.message || "Failed to load child transport information." };
  }
}

// ==========================================
// LEGACY COMPATIBILITY HELPERS
// ==========================================
export async function getBusStudentsAction(busId: string) {
  const res = await getBusDetailAction(busId);
  if (res.error) return { error: res.error };
  return { success: true, students: res.bus?.students || [] };
}

export async function reportBusIssueAction(data: {
  busId: string;
  issueType: any;
  description: string;
}) {
  return updateBusStatusAction(data.busId, {
    status: "DELAYED",
    issueType: data.issueType || "OTHER",
    description: data.description,
  });
}

export async function resolveBusIssueAction(busId: string) {
  return updateBusStatusAction(busId, {
    status: "RUNNING",
    description: "Issue marked as resolved. Bus returned to regular running service.",
  });
}

export async function sendBusAlertAction(data: {
  busId: string;
  message: string;
  title?: string;
  priority?: "NORMAL" | "URGENT";
  targetStudentId?: string;
  [key: string]: any;
}) {
  return sendBusMessageAction(data.busId, {
    type: data.targetStudentId ? "INDIVIDUAL" : "COMMON",
    targetStudentId: data.targetStudentId,
    title: data.title || "Bus Alert",
    message: data.message,
    priority: data.priority || (data.severity === "CRITICAL" ? "URGENT" : "NORMAL"),
  });
}

export async function getParentTransportOverviewAction() {
  return getParentBusOverviewAction();
}

