"use server";

import { prisma } from "@/backend/db/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { invalidateUserNotifCache } from "@/backend/api/actions/notifications/unifiedNotificationActions";

// ==========================================
// 1. GET TRANSPORT OVERVIEW FOR ADMIN
// ==========================================
export async function getTransportOverviewAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    // 1. Fetch all buses with students count, incharge info, and recent alerts
    const buses = await prisma.bus.findMany({
      orderBy: { busNumber: "asc" },
      include: {
        inchargeTeacher: {
          select: {
            id: true,
            phone: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            students: true,
          },
        },
        alerts: {
          orderBy: { createdAt: "desc" },
          take: 3,
        },
      },
    });

    // 2. Fetch available teachers for in-charge selection
    const teachers = await prisma.teacher.findMany({
      where: { isActive: true },
      select: {
        id: true,
        phone: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { user: { name: "asc" } },
    });

    // 3. Fetch active classes with students for student assignment modal
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
            busAssignments: {
              select: {
                id: true,
                busId: true,
                pickupStop: true,
                dropStop: true,
                bus: {
                  select: {
                    busNumber: true,
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

    // 4. Fetch recent bus alert logs across the school
    const recentAlerts = await prisma.busAlert.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        bus: {
          select: {
            id: true,
            busNumber: true,
            routeName: true,
          },
        },
      },
    });

    return {
      success: true,
      data: {
        buses,
        teachers,
        classes,
        recentAlerts,
      },
    };
  } catch (error: any) {
    console.error("Error fetching transport overview:", error);
    return { error: error?.message || "Failed to load transport details" };
  }
}

// ==========================================
// 2. GET STUDENTS ASSIGNED TO A SPECIFIC BUS
// ==========================================
export async function getBusStudentsAction(busId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    const assignments = await prisma.busStudent.findMany({
      where: { busId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            rollNumber: true,
            admissionNo: true,
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
    });

    return { success: true, students: assignments };
  } catch (error: any) {
    console.error("Error fetching bus students:", error);
    return { error: error?.message || "Failed to load bus students" };
  }
}

// ==========================================
// 3. CREATE NEW BUS
// ==========================================
export async function createBusAction(data: {
  busNumber: string;
  registrationNumber: string;
  routeName: string;
  capacity: number;
  driverName: string;
  driverPhone: string;
  inchargeTeacherId?: string | null;
  inchargeStaffName?: string | null;
  inchargeStaffPhone?: string | null;
}) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Only administrators can create buses" };
    }

    if (!data.busNumber?.trim()) return { error: "Bus Number is required (e.g. Bus 01)" };
    if (!data.registrationNumber?.trim()) return { error: "Registration Number is required" };
    if (!data.routeName?.trim()) return { error: "Route Name is required" };
    if (!data.driverName?.trim()) return { error: "Driver Name is required" };
    if (!data.driverPhone?.trim()) return { error: "Driver Phone is required" };

    // Check unique busNumber
    const existing = await prisma.bus.findUnique({
      where: { busNumber: data.busNumber.trim() },
    });
    if (existing) {
      return { error: `Bus number "${data.busNumber}" already exists.` };
    }

    // If teacher selected, pull their phone/name as fallback incharge details
    let staffName = data.inchargeStaffName?.trim() || null;
    let staffPhone = data.inchargeStaffPhone?.trim() || null;

    if (data.inchargeTeacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: data.inchargeTeacherId },
        include: { user: true },
      });
      if (teacher) {
        if (!staffName) staffName = teacher.user.name;
        if (!staffPhone) staffPhone = teacher.phone || "";
      }
    }

    const newBus = await prisma.bus.create({
      data: {
        busNumber: data.busNumber.trim(),
        registrationNumber: data.registrationNumber.trim().toUpperCase(),
        routeName: data.routeName.trim(),
        capacity: Number(data.capacity) || 40,
        driverName: data.driverName.trim(),
        driverPhone: data.driverPhone.trim(),
        inchargeTeacherId: data.inchargeTeacherId || null,
        inchargeStaffName: staffName,
        inchargeStaffPhone: staffPhone,
        status: "ACTIVE",
      },
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true, bus: newBus };
  } catch (error: any) {
    console.error("Error creating bus:", error);
    return { error: error?.message || "Failed to create bus" };
  }
}

// ==========================================
// 4. UPDATE BUS DETAILS
// ==========================================
export async function updateBusAction(
  busId: string,
  data: {
    busNumber?: string;
    registrationNumber?: string;
    routeName?: string;
    capacity?: number;
    driverName?: string;
    driverPhone?: string;
    inchargeTeacherId?: string | null;
    inchargeStaffName?: string | null;
    inchargeStaffPhone?: string | null;
    status?: string;
  }
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    const bus = await prisma.bus.findUnique({ where: { id: busId } });
    if (!bus) return { error: "Bus not found" };

    if (data.busNumber && data.busNumber.trim() !== bus.busNumber) {
      const conflict = await prisma.bus.findUnique({
        where: { busNumber: data.busNumber.trim() },
      });
      if (conflict) {
        return { error: `Bus number "${data.busNumber}" is already in use.` };
      }
    }

    let staffName = data.inchargeStaffName?.trim() ?? bus.inchargeStaffName;
    let staffPhone = data.inchargeStaffPhone?.trim() ?? bus.inchargeStaffPhone;

    if (data.inchargeTeacherId && data.inchargeTeacherId !== bus.inchargeTeacherId) {
      const teacher = await prisma.teacher.findUnique({
        where: { id: data.inchargeTeacherId },
        include: { user: true },
      });
      if (teacher) {
        staffName = teacher.user.name;
        staffPhone = teacher.phone || "";
      }
    }

    const updated = await prisma.bus.update({
      where: { id: busId },
      data: {
        ...(data.busNumber ? { busNumber: data.busNumber.trim() } : {}),
        ...(data.registrationNumber ? { registrationNumber: data.registrationNumber.trim().toUpperCase() } : {}),
        ...(data.routeName ? { routeName: data.routeName.trim() } : {}),
        ...(data.capacity !== undefined ? { capacity: Number(data.capacity) } : {}),
        ...(data.driverName ? { driverName: data.driverName.trim() } : {}),
        ...(data.driverPhone ? { driverPhone: data.driverPhone.trim() } : {}),
        inchargeTeacherId: data.inchargeTeacherId !== undefined ? data.inchargeTeacherId : bus.inchargeTeacherId,
        inchargeStaffName: staffName,
        inchargeStaffPhone: staffPhone,
        ...(data.status ? { status: data.status } : {}),
      },
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true, bus: updated };
  } catch (error: any) {
    console.error("Error updating bus:", error);
    return { error: error?.message || "Failed to update bus details" };
  }
}

// ==========================================
// 5. DELETE BUS
// ==========================================
export async function deleteBusAction(busId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "ADMIN") {
      return { error: "Unauthorized: Only administrators can delete buses" };
    }

    await prisma.bus.delete({
      where: { id: busId },
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true };
  } catch (error: any) {
    console.error("Error deleting bus:", error);
    return { error: error?.message || "Failed to delete bus" };
  }
}

// ==========================================
// 6. ASSIGN STUDENTS TO BUS
// ==========================================
export async function assignStudentsToBusAction(
  busId: string,
  assignments: Array<{
    studentId: string;
    pickupStop?: string;
    pickupTime?: string;
    dropStop?: string;
    dropTime?: string;
  }>
) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      include: { _count: { select: { students: true } } },
    });
    if (!bus) return { error: "Bus not found" };

    if (!assignments || assignments.length === 0) {
      return { error: "No students provided for assignment" };
    }

    // Process assignments in a transaction
    await prisma.$transaction(async (tx) => {
      for (const item of assignments) {
        // Upsert into BusStudent
        await tx.busStudent.upsert({
          where: {
            busId_studentId: {
              busId,
              studentId: item.studentId,
            },
          },
          update: {
            pickupStop: item.pickupStop || null,
            pickupTime: item.pickupTime || null,
            dropStop: item.dropStop || null,
            dropTime: item.dropTime || null,
            status: "ACTIVE",
          },
          create: {
            busId,
            studentId: item.studentId,
            pickupStop: item.pickupStop || null,
            pickupTime: item.pickupTime || null,
            dropStop: item.dropStop || null,
            dropTime: item.dropTime || null,
            status: "ACTIVE",
          },
        });
      }
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true, count: assignments.length };
  } catch (error: any) {
    console.error("Error assigning students to bus:", error);
    return { error: error?.message || "Failed to assign students" };
  }
}

// ==========================================
// 7. REMOVE STUDENT FROM BUS
// ==========================================
export async function removeStudentFromBusAction(busStudentId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    await prisma.busStudent.delete({
      where: { id: busStudentId },
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true };
  } catch (error: any) {
    console.error("Error removing student from bus:", error);
    return { error: error?.message || "Failed to unassign student" };
  }
}

// ==========================================
// 8. REPORT BUS ISSUE
// ==========================================
export async function reportBusIssueAction(busId: string, issue: string, status: string = "BREAKDOWN") {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    const bus = await prisma.bus.update({
      where: { id: busId },
      data: {
        status,
        currentIssue: issue.trim(),
        issueReportedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true, bus };
  } catch (error: any) {
    console.error("Error reporting bus issue:", error);
    return { error: error?.message || "Failed to report issue" };
  }
}

// ==========================================
// 9. RESOLVE BUS ISSUE
// ==========================================
export async function resolveBusIssueAction(busId: string) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    const bus = await prisma.bus.update({
      where: { id: busId },
      data: {
        status: "ACTIVE",
        currentIssue: null,
        issueReportedAt: null,
      },
    });

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    return { success: true, bus };
  } catch (error: any) {
    console.error("Error resolving bus issue:", error);
    return { error: error?.message || "Failed to resolve issue" };
  }
}

// ==========================================
// 10. DISPATCH BUS ALERT & CONNECT NOTIFICATIONS
// ==========================================
export async function sendBusAlertAction(payload: {
  busId: string;
  title: string;
  message: string;
  alertType: "BREAKDOWN" | "DELAY" | "ROUTE_CHANGE" | "EMERGENCY" | "GENERAL";
  severity?: "INFO" | "WARNING" | "URGENT";
  targetType: "ALL_PARENTS" | "INDIVIDUAL";
  targetStudentId?: string | null;
  updateBusStatus?: boolean;
}) {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || !["ADMIN", "TEACHER"].includes(session.user.role)) {
      return { error: "Unauthorized access" };
    }

    if (!payload.title?.trim() || !payload.message?.trim()) {
      return { error: "Alert title and message are required." };
    }

    const bus = await prisma.bus.findUnique({
      where: { id: payload.busId },
      include: {
        inchargeTeacher: { include: { user: true } },
      },
    });
    if (!bus) return { error: "Bus not found." };

    const severity = payload.severity || (payload.alertType === "BREAKDOWN" || payload.alertType === "EMERGENCY" ? "URGENT" : "WARNING");

    // Optional status update on the bus fleet record
    if (payload.updateBusStatus || payload.alertType === "BREAKDOWN" || payload.alertType === "DELAY") {
      let newStatus = bus.status;
      if (payload.alertType === "BREAKDOWN") newStatus = "BREAKDOWN";
      else if (payload.alertType === "DELAY") newStatus = "DELAYED";
      else if (payload.alertType === "EMERGENCY") newStatus = "BREAKDOWN";

      await prisma.bus.update({
        where: { id: bus.id },
        data: {
          status: newStatus,
          currentIssue: `${payload.title}: ${payload.message}`,
          issueReportedAt: new Date(),
        },
      });
    }

    // Identify recipient Parent user IDs
    let recipientUserIds: string[] = [];

    if (payload.targetType === "ALL_PARENTS") {
      // Find all students on this bus
      const busStudents = await prisma.busStudent.findMany({
        where: { busId: bus.id, status: "ACTIVE" },
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
          if (p.parent?.userId && !recipientUserIds.includes(p.parent.userId)) {
            recipientUserIds.push(p.parent.userId);
          }
        }
      }
    } else if (payload.targetType === "INDIVIDUAL" && payload.targetStudentId) {
      // Specific individual student's parent
      const parentStudents = await prisma.parentStudent.findMany({
        where: { studentId: payload.targetStudentId },
        select: {
          parent: {
            select: {
              userId: true,
            },
          },
        },
      });

      for (const ps of parentStudents) {
        if (ps.parent?.userId && !recipientUserIds.includes(ps.parent.userId)) {
          recipientUserIds.push(ps.parent.userId);
        }
      }
    }

    // Save persistent BusAlert history record
    const createdAlert = await prisma.busAlert.create({
      data: {
        busId: bus.id,
        senderId: session.user.id,
        senderName: session.user.name || "School Administration",
        senderRole: session.user.role,
        title: payload.title.trim(),
        message: payload.message.trim(),
        alertType: payload.alertType,
        severity,
        targetType: payload.targetType,
        targetStudentId: payload.targetStudentId || null,
        recipientCount: recipientUserIds.length,
      },
    });

    // CONNECT DIRECTLY TO NOTIFICATION DATABASE
    if (recipientUserIds.length > 0) {
      const notifIcon = payload.alertType === "BREAKDOWN" ? "⚠️" : payload.alertType === "DELAY" ? "⏱️" : "🚌";
      const notifTitle = `${notifIcon} Bus ${bus.busNumber}: ${payload.title.trim()}`;
      const notifContent = payload.message.trim();

      // Batch insert into Notification table
      await prisma.notification.createMany({
        data: recipientUserIds.map((userId) => ({
          userId,
          title: notifTitle,
          content: notifContent,
          type: "BUS_ALERT",
          link: "/dashboard/parent/transport",
          isRead: false,
        })),
      });

      // Invalidate per-user notification caches so popup modal & badges refresh instantly
      for (const uid of recipientUserIds) {
        invalidateUserNotifCache(uid);
      }
    }

    revalidatePath("/dashboard/admin/transport");
    revalidatePath("/dashboard/parent/transport");
    revalidatePath("/dashboard/parent/notifications");

    return {
      success: true,
      alert: createdAlert,
      recipientCount: recipientUserIds.length,
      message: `Alert dispatched successfully to ${recipientUserIds.length} parent account${recipientUserIds.length === 1 ? "" : "s"}.`,
    };
  } catch (error: any) {
    console.error("Error sending bus alert:", error);
    return { error: error?.message || "Failed to dispatch bus alert" };
  }
}

// ==========================================
// 11. GET TRANSPORT DETAILS FOR PARENT
// ==========================================
export async function getParentTransportOverviewAction() {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session || session.user.role !== "PARENT") {
      return { error: "Unauthorized access: Parent portal only" };
    }

    // 1. Find parent profile
    const parent = await prisma.parent.findUnique({
      where: { userId: session.user.id },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: true,
                busAssignments: {
                  where: { status: "ACTIVE" },
                  include: {
                    bus: {
                      include: {
                        inchargeTeacher: {
                          include: {
                            user: {
                              select: {
                                name: true,
                                email: true,
                              },
                            },
                          },
                        },
                        alerts: {
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
      return { error: "Parent profile not found" };
    }

    // Format child transport items
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
              registrationNumber: assignment.bus.registrationNumber,
              routeName: assignment.bus.routeName,
              driverName: assignment.bus.driverName,
              driverPhone: assignment.bus.driverPhone,
              inchargeName:
                assignment.bus.inchargeTeacher?.user?.name ||
                assignment.bus.inchargeStaffName ||
                "Transport Coordinator",
              inchargePhone:
                assignment.bus.inchargeTeacher?.phone ||
                assignment.bus.inchargeStaffPhone ||
                "Contact School Office",
              status: assignment.bus.status,
              currentIssue: assignment.bus.currentIssue,
              issueReportedAt: assignment.bus.issueReportedAt,
              pickupStop: assignment.pickupStop,
              pickupTime: assignment.pickupTime,
              dropStop: assignment.dropStop,
              dropTime: assignment.dropTime,
              recentAlerts: assignment.bus.alerts,
            }
          : null,
      };
    });

    return { success: true, children: childrenTransport };
  } catch (error: any) {
    console.error("Error fetching parent transport overview:", error);
    return { error: error?.message || "Failed to load child transport information" };
  }
}

