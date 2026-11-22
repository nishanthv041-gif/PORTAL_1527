"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";
import { normalizeDateToUTC, formatSchoolDate } from "@/backend/lib/timetable/getEffectiveTimetable";
import { sendUnifiedNotification } from "@/backend/services/notifications/unifiedNotificationEngine";

const DAYS_OF_WEEK = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export interface FreeTeacherItem {
  id: string;
  name: string;
  email?: string;
  subjects: string[];
  freeInPeriods: number[];
}

export interface AbsentPeriodSlot {
  timetableEntryId: string;
  period: number;
  startTime: string;
  endTime: string;
  classId: string;
  className: string;
  subjectId?: string | null;
  subjectName: string;
  classroom?: string | null;
  status: "NOT_ASSIGNED" | "ASSIGNED" | "FREE_PERIOD";
  substituteTeacherId?: string | null;
  substituteTeacherName?: string | null;
  substitutionId?: string | null;
  note?: string | null;
}

export interface TeacherAbsenceRecord {
  id: string;
  teacherId: string;
  teacherName: string;
  date: string;
  formattedDate: string;
  fullDay: boolean;
  periodNumbers: string | null;
  reason: string | null;
  status: string;
}

/**
 * Dispatches database notification popups and system inbox alerts safely
 */
async function sendNotification(userId: string, title: string, content: string, link: string) {
  try {
    await sendUnifiedNotification({
      userId,
      title,
      content,
      type: "SYSTEM",
      category: "academic",
      link,
    });
  } catch (err) {
    console.warn("Failed to dispatch notification to user:", userId, err);
  }
}

/**
 * STEP A: Mark a teacher absent for a given date
 * Validates teacher, verifies teacher has classes, and records TeacherAbsence
 */
export async function markTeacherAbsenceAction(data: {
  teacherId: string;
  dateStr: string; // YYYY-MM-DD
  fullDay?: boolean;
  periodNumbers?: number[];
  reason?: string;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized: Admin access required." };
  }

  const { teacherId, dateStr, fullDay = true, periodNumbers, reason } = data;
  if (!teacherId) {
    return { success: false, error: "Please select an absent teacher." };
  }
  if (!dateStr) {
    return { success: false, error: "Please choose an absence date." };
  }

  try {
    const targetDate = normalizeDateToUTC(dateStr);
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];

    // 1. Check if teacher has any periods on this day of week
    const teacherSlots = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false,
        OR: [
          { teacherId },
          { subject: { teacherId } }
        ]
      },
      include: { class: true, subject: true },
      orderBy: { period: "asc" }
    });

    if (teacherSlots.length === 0) {
      return {
        success: false,
        error: `Teacher has no classes scheduled on ${dayOfWeek}s (${formatSchoolDate(targetDate)}).`
      };
    }

    // Filter to selected periods if partial day
    const affectedSlots = (periodNumbers && periodNumbers.length > 0 && !fullDay)
      ? teacherSlots.filter(s => periodNumbers.includes(s.period))
      : teacherSlots;

    if (affectedSlots.length === 0) {
      return {
        success: false,
        error: "None of the selected periods match the teacher's scheduled classes."
      };
    }

    // 2. Create or reuse TeacherAbsence record
    const absence = await prisma.teacherAbsence.create({
      data: {
        teacherId,
        date: targetDate,
        fullDay,
        periodNumbers: !fullDay && periodNumbers && periodNumbers.length > 0 ? periodNumbers.join(",") : null,
        reason: reason || "Personal / Medical Leave",
        source: "ADMIN_MARKED",
        status: "ACTIVE"
      }
    });

    // 3. Create initial Substitution records for the affected periods if not already present
    for (const slot of affectedSlots) {
      const existing = await prisma.substitution.findFirst({
        where: {
          date: targetDate,
          timetableEntryId: slot.id
        }
      });

      if (!existing) {
        await prisma.substitution.create({
          data: {
            date: targetDate,
            timetableEntryId: slot.id,
            absentTeacherId: teacherId,
            absenceId: absence.id,
            status: "SUGGESTED"
          }
        });
      }
    }

    // 4. Log audit record
    await prisma.timetableAudit.create({
      data: {
        action: "SUBSTITUTE",
        userId: session.user.id,
        details: `Marked teacher ${teacherId} absent on ${dateStr} for ${affectedSlots.length} periods.`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/parent/timetable");

    return {
      success: true,
      absenceId: absence.id,
      teacherId,
      dateStr,
      affectedCount: affectedSlots.length
    };
  } catch (error: any) {
    console.error("markTeacherAbsenceAction error:", error);
    return { success: false, error: error.message || "Failed to mark teacher absence." };
  }
}

/**
 * STEP B & C: Returns periods of an absent teacher on a date, plus the status of each
 */
export async function getAbsentTeacherPeriodsAction(
  teacherId: string,
  dateStr: string
): Promise<{
  success: boolean;
  teacher?: { id: string; name: string };
  date: string;
  formattedDate: string;
  dayOfWeek: string;
  periods: AbsentPeriodSlot[];
  error?: string;
}> {
  try {
    const targetDate = normalizeDateToUTC(dateStr);
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];

    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: true }
    });

    if (!teacher) {
      return {
        success: false,
        date: dateStr,
        formattedDate: formatSchoolDate(targetDate),
        dayOfWeek,
        periods: [],
        error: "Teacher not found."
      };
    }

    // Find all timetable slots for this teacher on this day of week
    const slots = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false,
        OR: [
          { teacherId },
          { subject: { teacherId } }
        ]
      },
      include: {
        class: true,
        subject: true
      },
      orderBy: { period: "asc" }
    });

    // Find any existing substitutions for this date
    const substitutions = await prisma.substitution.findMany({
      where: {
        date: targetDate,
        timetableEntryId: { in: slots.map(s => s.id) }
      },
      include: {
        substituteTeacher: { include: { user: true } }
      }
    });

    const subMap = new Map<string, typeof substitutions[0]>();
    substitutions.forEach(s => subMap.set(s.timetableEntryId, s));

    const periods: AbsentPeriodSlot[] = slots.map(slot => {
      const sub = subMap.get(slot.id);
      let status: AbsentPeriodSlot["status"] = "NOT_ASSIGNED";
      if (sub) {
        if (sub.status === "ASSIGNED" && sub.substituteTeacherId) {
          status = "ASSIGNED";
        } else if (sub.status === "UNASSIGNED" || (!sub.substituteTeacherId && sub.note?.includes("Free Period"))) {
          status = "FREE_PERIOD";
        }
      }

      return {
        timetableEntryId: slot.id,
        period: slot.period,
        startTime: slot.startTime,
        endTime: slot.endTime,
        classId: slot.classId,
        className: `${slot.class.name} - ${slot.class.section}`,
        subjectId: slot.subjectId,
        subjectName: slot.subject?.name || "Subject",
        classroom: slot.classroom,
        status,
        substituteTeacherId: sub?.substituteTeacherId || null,
        substituteTeacherName: sub?.substituteTeacher?.user?.name || null,
        substitutionId: sub?.id || null,
        note: sub?.note || null
      };
    });

    return {
      success: true,
      teacher: { id: teacher.id, name: teacher.user.name || "Teacher" },
      date: dateStr,
      formattedDate: formatSchoolDate(targetDate),
      dayOfWeek,
      periods
    };
  } catch (error: any) {
    console.error("getAbsentTeacherPeriodsAction error:", error);
    return {
      success: false,
      date: dateStr,
      formattedDate: dateStr,
      dayOfWeek: "",
      periods: [],
      error: error.message || "Failed to load periods"
    };
  }
}

/**
 * STEP C: Simple Filter returning ONLY teachers who are genuinely FREE
 * in the requested period(s) on that date.
 * Excludes:
 * 1. The absent teacher
 * 2. Teachers with active absence on that date
 * 3. Teachers teaching their own class in that period
 * 4. Teachers already covering a substitution in that period
 *
 * Plain alphabetical list. No ranking, no scores, no warnings.
 */
export async function getFreeTeachersForPeriodsAction(opts: {
  dateStr: string;
  periodNumbers: number[];
  absentTeacherId: string;
  matchAllPeriods?: boolean; // if true, must be free in ALL periodNumbers; if false, free in ANY
}): Promise<{
  success: boolean;
  freeTeachers: FreeTeacherItem[];
  error?: string;
}> {
  try {
    const { dateStr, periodNumbers, absentTeacherId, matchAllPeriods = true } = opts;
    if (!periodNumbers || periodNumbers.length === 0) {
      return { success: true, freeTeachers: [] };
    }

    const targetDate = normalizeDateToUTC(dateStr);
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];

    // 1. Fetch all teachers with user info and subjects
    const allTeachers = await prisma.teacher.findMany({
      include: {
        user: true,
        subjects: { select: { name: true } }
      },
      orderBy: { user: { name: "asc" } }
    });

    // 2. Fetch active absences on this date
    const absencesToday = await prisma.teacherAbsence.findMany({
      where: { date: targetDate, status: "ACTIVE" }
    });
    const absentTeacherIds = new Set(absencesToday.map(a => a.teacherId));
    absentTeacherIds.add(absentTeacherId);

    // 3. Fetch regular timetable slots across the school on this dayOfWeek
    const regularSlots = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false,
        period: { in: periodNumbers }
      },
      select: {
        period: true,
        teacherId: true,
        subject: { select: { teacherId: true } }
      }
    });

    // 4. Fetch already assigned substitutions on this date for these periods
    const assignedSubs = await prisma.substitution.findMany({
      where: {
        date: targetDate,
        status: "ASSIGNED",
        substituteTeacherId: { not: null }
      },
      include: {
        timetableEntry: { select: { period: true } }
      }
    });

    // Map teacherId -> set of periods they are BUSY in
    const busyPeriodsByTeacher = new Map<string, Set<number>>();

    const markBusy = (tId: string, p: number) => {
      if (!tId) return;
      if (!busyPeriodsByTeacher.has(tId)) {
        busyPeriodsByTeacher.set(tId, new Set<number>());
      }
      busyPeriodsByTeacher.get(tId)!.add(p);
    };

    for (const slot of regularSlots) {
      const tId = slot.teacherId || slot.subject?.teacherId;
      if (tId) markBusy(tId, slot.period);
    }

    for (const sub of assignedSubs) {
      if (sub.substituteTeacherId) {
        markBusy(sub.substituteTeacherId, sub.timetableEntry.period);
      }
    }

    // Filter free teachers
    const freeTeachers: FreeTeacherItem[] = [];

    for (const teacher of allTeachers) {
      // Exclude absent teacher and teachers on leave
      if (absentTeacherIds.has(teacher.id)) continue;

      const busySet = busyPeriodsByTeacher.get(teacher.id) || new Set<number>();
      const freePeriods = periodNumbers.filter(p => !busySet.has(p));

      if (matchAllPeriods) {
        // Must be free in ALL selected periods
        if (freePeriods.length === periodNumbers.length) {
          freeTeachers.push({
            id: teacher.id,
            name: teacher.user.name || "Faculty Member",
            email: teacher.user.email || undefined,
            subjects: teacher.subjects.map(s => s.name),
            freeInPeriods: freePeriods
          });
        }
      } else {
        // Free in AT LEAST ONE selected period
        if (freePeriods.length > 0) {
          freeTeachers.push({
            id: teacher.id,
            name: teacher.user.name || "Faculty Member",
            email: teacher.user.email || undefined,
            subjects: teacher.subjects.map(s => s.name),
            freeInPeriods: freePeriods
          });
        }
      }
    }

    // Sort alphabetically by name
    freeTeachers.sort((a, b) => a.name.localeCompare(b.name));

    return {
      success: true,
      freeTeachers
    };
  } catch (error: any) {
    console.error("getFreeTeachersForPeriodsAction error:", error);
    return { success: false, freeTeachers: [], error: error.message || "Failed to find free teachers." };
  }
}

/**
 * STEP D: Final Assign
 * Saves Substitution records (date, timetableEntryId, absentTeacherId, substituteTeacherId, status ASSIGNED)
 * in one atomic database transaction. Dispatches notifications.
 */
export async function assignSubstitutesBatchAction(data: {
  dateStr: string;
  absentTeacherId: string;
  assignments: Array<{
    timetableEntryId: string;
    substituteTeacherId: string | null;
    isFreePeriod?: boolean;
    note?: string;
  }>;
}) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized: Admin access required." };
  }

  const { dateStr, absentTeacherId, assignments } = data;
  if (!assignments || assignments.length === 0) {
    return { success: false, error: "No periods selected for assignment." };
  }

  try {
    const targetDate = normalizeDateToUTC(dateStr);
    const formattedDate = formatSchoolDate(targetDate);

    // Fetch absent teacher details for notifications
    const absentTeacher = await prisma.teacher.findUnique({
      where: { id: absentTeacherId },
      include: { user: true }
    });
    const absentTeacherName = absentTeacher?.user.name || "Faculty Member";

    // Track affected parents and substitutes for notification dispatch
    const notificationQueue: Array<{ userId: string; title: string; content: string; link: string }> = [];

    // Atomic transaction
    await prisma.$transaction(async (tx) => {
      for (const item of assignments) {
        const slot = await tx.timetable.findUnique({
          where: { id: item.timetableEntryId },
          include: {
            class: {
              include: {
                students: {
                  select: {
                    parents: {
                      select: {
                        parent: { select: { userId: true } }
                      }
                    }
                  }
                }
              }
            },
            subject: true
          }
        });

        if (!slot) continue;

        const isFree = Boolean(item.isFreePeriod) || !item.substituteTeacherId;
        const subTeacherId = isFree ? null : item.substituteTeacherId;
        const status = isFree ? "UNASSIGNED" : "ASSIGNED";
        const note = item.note || (isFree ? "Free Period (Teacher Absent)" : `Substitute for ${absentTeacherName}`);

        // Upsert substitution
        const existing = await tx.substitution.findFirst({
          where: {
            date: targetDate,
            timetableEntryId: item.timetableEntryId
          }
        });

        if (existing) {
          await tx.substitution.update({
            where: { id: existing.id },
            data: {
              substituteTeacherId: subTeacherId,
              status,
              note
            }
          });
        } else {
          await tx.substitution.create({
            data: {
              date: targetDate,
              timetableEntryId: item.timetableEntryId,
              absentTeacherId,
              substituteTeacherId: subTeacherId,
              status,
              note
            }
          });
        }

        // Queue notifications
        const subjectName = slot.subject?.name || "Class";
        const className = `${slot.class.name} - ${slot.class.section}`;

        if (subTeacherId) {
          // Find substitute's user account
          const subTeacher = await tx.teacher.findUnique({
            where: { id: subTeacherId },
            include: { user: true }
          });

          if (subTeacher?.user?.id) {
            notificationQueue.push({
              userId: subTeacher.user.id,
              title: "Substitution Duty Assigned",
              content: `You are assigned to cover ${subjectName} for ${className} on ${formattedDate} (Period ${slot.period}). Covering for ${absentTeacherName}.`,
              link: "/dashboard/teacher/timetable"
            });
          }

          // Notify parents of students in that class
          for (const st of slot.class.students) {
            for (const ps of st.parents) {
              if (ps.parent?.userId) {
                notificationQueue.push({
                  userId: ps.parent.userId,
                  title: "Class Timetable Update: Substitute Assigned",
                  content: `${subjectName} on ${formattedDate} (Period ${slot.period}) will be taken by ${subTeacher?.user.name || "a substitute teacher"}.`,
                  link: "/dashboard/parent/timetable"
                });
              }
            }
          }
        }
      }
    });

    // Notify absent teacher
    if (absentTeacher?.user.id) {
      notificationQueue.push({
        userId: absentTeacher.user.id,
        title: "Class Coverage Assigned",
        content: `Your classes on ${formattedDate} have been assigned to substitute teachers.`,
        link: "/dashboard/teacher/timetable"
      });
    }

    // Dispatch queued notifications asynchronously
    for (const notif of notificationQueue) {
      await sendNotification(notif.userId, notif.title, notif.content, notif.link);
    }

    // Log audit
    await prisma.timetableAudit.create({
      data: {
        action: "SUBSTITUTE",
        userId: session.user.id,
        details: `Assigned substitutes for ${assignments.length} periods on ${dateStr}.`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/parent/timetable");

    return {
      success: true,
      count: assignments.length,
      dateStr,
      absentTeacherId
    };
  } catch (error: any) {
    console.error("assignSubstitutesBatchAction error:", error);
    return { success: false, error: error.message || "Failed to assign substitutes." };
  }
}

/**
 * Undoes or clears specific substitution assignments
 */
export async function undoSubstitutionAssignmentAction(substitutionIds: string[]) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized." };
  }

  try {
    await prisma.substitution.updateMany({
      where: { id: { in: substitutionIds } },
      data: {
        substituteTeacherId: null,
        status: "UNASSIGNED",
        note: "Assignment undone by admin"
      }
    });

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/parent/timetable");

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to undo assignment." };
  }
}

/**
 * Cancels teacher absence and deletes associated substitution records
 * Cleanly reverts timetable overlays without modifying base timetable!
 */
export async function cancelAbsenceAction(absenceId: string) {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "ADMIN") {
    return { success: false, error: "Unauthorized: Admin access required." };
  }

  try {
    const absence = await prisma.teacherAbsence.findUnique({
      where: { id: absenceId },
      include: {
        teacher: { include: { user: true } },
        substitutions: {
          include: {
            substituteTeacher: { include: { user: true } },
            timetableEntry: { include: { class: true, subject: true } }
          }
        }
      }
    });

    if (!absence) {
      return { success: false, error: "Absence record not found." };
    }

    // 1. Delete associated substitution records so base timetable is immediately restored
    await prisma.substitution.deleteMany({
      where: { absenceId }
    });

    // 2. Mark absence cancelled
    await prisma.teacherAbsence.update({
      where: { id: absenceId },
      data: { status: "CANCELLED" }
    });

    // 3. Notify substitutes that duty was cancelled
    for (const sub of absence.substitutions) {
      if (sub.substituteTeacher?.user?.id) {
        await sendNotification(
          sub.substituteTeacher.user.id,
          "Substitution Duty Cancelled",
          `The substitution duty on ${formatSchoolDate(absence.date)} for ${sub.timetableEntry.class.name} has been cancelled.`,
          "/dashboard/teacher/timetable"
        );
      }
    }

    // 4. Log audit
    await prisma.timetableAudit.create({
      data: {
        action: "SUBSTITUTE",
        userId: session.user.id,
        details: `Cancelled absence ${absenceId} for ${absence.teacher.user.name || "teacher"}.`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/parent/timetable");

    return { success: true };
  } catch (error: any) {
    console.error("cancelAbsenceAction error:", error);
    return { success: false, error: error.message || "Failed to cancel absence." };
  }
}

/**
 * Returns all active absences and substitution statuses on a given date
 */
export async function getSubstitutionDataForDateAction(dateStr: string) {
  try {
    const targetDate = normalizeDateToUTC(dateStr);
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];

    const [absences, substitutions, allTeachers] = await Promise.all([
      prisma.teacherAbsence.findMany({
        where: { date: targetDate, status: "ACTIVE" },
        include: { teacher: { include: { user: true } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.substitution.findMany({
        where: { date: targetDate },
        include: {
          timetableEntry: {
            include: {
              class: { select: { id: true, name: true, section: true } },
              subject: { select: { id: true, name: true } }
            }
          },
          absentTeacher: { include: { user: true } },
          substituteTeacher: { include: { user: true } }
        },
        orderBy: { timetableEntry: { period: "asc" } }
      }),
      prisma.teacher.findMany({
        include: { user: true, subjects: true },
        orderBy: { user: { name: "asc" } }
      })
    ]);

    return {
      success: true,
      date: dateStr,
      formattedDate: formatSchoolDate(targetDate),
      dayOfWeek,
      absences: absences.map(a => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: a.teacher.user.name || "Teacher",
        date: dateStr,
        formattedDate: formatSchoolDate(a.date),
        fullDay: a.fullDay,
        periodNumbers: a.periodNumbers,
        reason: a.reason,
        status: a.status
      })),
      substitutions: substitutions.map(s => ({
        id: s.id,
        date: dateStr,
        period: s.timetableEntry.period,
        startTime: s.timetableEntry.startTime,
        endTime: s.timetableEntry.endTime,
        className: `${s.timetableEntry.class.name} - ${s.timetableEntry.class.section}`,
        classId: s.timetableEntry.classId,
        subjectName: s.timetableEntry.subject?.name || "Subject",
        absentTeacherId: s.absentTeacherId,
        absentTeacherName: s.absentTeacher.user.name || "Absent Teacher",
        substituteTeacherId: s.substituteTeacherId,
        substituteTeacherName: s.substituteTeacher?.user.name || null,
        status: s.status,
        note: s.note
      })),
      allTeachers: allTeachers.map(t => ({
        id: t.id,
        name: t.user.name || "Teacher",
        subjects: t.subjects.map(s => s.name)
      }))
    };
  } catch (error: any) {
    console.error("getSubstitutionDataForDateAction error:", error);
    return {
      success: false,
      date: dateStr,
      formattedDate: dateStr,
      dayOfWeek: "",
      error: error.message || "Failed to load data",
      absences: [],
      substitutions: [],
      allTeachers: []
    };
  }
}

export interface StaffShiftPeriodSlot {
  timetableEntryId: string;
  period: number;
  startTime: string;
  endTime: string;
  classId: string;
  className: string;
  subjectId?: string | null;
  subjectName: string;
  classroom?: string | null;
  status: "NOT_ASSIGNED" | "ASSIGNED" | "FREE_PERIOD";
  substituteTeacherId?: string | null;
  substituteTeacherName?: string | null;
  substitutionId?: string | null;
  note?: string | null;
  freeTeachers: Array<{
    id: string;
    name: string;
    subjects: string[];
  }>;
}

/**
 * Returns a staff member's assigned classes on a specific date,
 * and for EACH period, calculates strictly the teachers who are FREE in that exact period!
 * Accessible by Admins and Teachers (teachers can inspect their own classes).
 */
export async function getStaffShiftPeriodsWithFreeTeachersAction(opts: {
  teacherId?: string;
  dateStr: string;
}): Promise<{
  success: boolean;
  teacher?: { id: string; name: string };
  date: string;
  formattedDate: string;
  dayOfWeek: string;
  periods: StaffShiftPeriodSlot[];
  error?: string;
}> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session) {
      return {
        success: false,
        date: opts.dateStr,
        formattedDate: opts.dateStr,
        dayOfWeek: "",
        periods: [],
        error: "Unauthorized"
      };
    }

    const { dateStr } = opts;
    const targetDate = normalizeDateToUTC(dateStr);
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];

    // Resolve target teacher
    let targetTeacherId = opts.teacherId;
    if (!targetTeacherId) {
      if (session.user.role === "TEACHER") {
        const t = await prisma.teacher.findUnique({
          where: { userId: session.user.id },
          select: { id: true }
        });
        targetTeacherId = t?.id;
      }
    }

    if (!targetTeacherId) {
      return {
        success: false,
        date: dateStr,
        formattedDate: formatSchoolDate(targetDate),
        dayOfWeek,
        periods: [],
        error: "Please specify a teacher."
      };
    }

    // Verify permission: teachers may only inspect their own slots; admins may inspect anyone
    if (session.user.role === "TEACHER") {
      const teacherOwn = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true }
      });
      if (!teacherOwn || teacherOwn.id !== targetTeacherId) {
        return {
          success: false,
          date: dateStr,
          formattedDate: formatSchoolDate(targetDate),
          dayOfWeek,
          periods: [],
          error: "Unauthorized to access other staff's shift schedule."
        };
      }
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: targetTeacherId },
      include: { user: true }
    });

    if (!teacher) {
      return {
        success: false,
        date: dateStr,
        formattedDate: formatSchoolDate(targetDate),
        dayOfWeek,
        periods: [],
        error: "Teacher not found."
      };
    }

    // 1. Fetch teacher's scheduled timetable slots for this day of week
    const slots = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false,
        OR: [
          { teacherId: targetTeacherId },
          { subject: { teacherId: targetTeacherId } }
        ]
      },
      include: {
        class: { select: { id: true, name: true, section: true } },
        subject: { select: { id: true, name: true } }
      },
      orderBy: [{ period: "asc" }, { startTime: "asc" }]
    });

    if (slots.length === 0) {
      return {
        success: true,
        teacher: { id: teacher.id, name: teacher.user.name || "Teacher" },
        date: dateStr,
        formattedDate: formatSchoolDate(targetDate),
        dayOfWeek,
        periods: []
      };
    }

    const periodNumbers = Array.from(new Set(slots.map(s => s.period)));

    // 2. Fetch all active teachers
    const allTeachers = await prisma.teacher.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        subjects: { select: { name: true } }
      },
      orderBy: { user: { name: "asc" } }
    });

    // 3. Fetch active absences on this date
    const absencesToday = await prisma.teacherAbsence.findMany({
      where: { date: targetDate, status: "ACTIVE" }
    });
    const absentTeacherIds = new Set(absencesToday.map(a => a.teacherId));
    absentTeacherIds.add(targetTeacherId);

    // 4. Fetch regular slots across the school for these periods
    const regularSlots = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false,
        period: { in: periodNumbers }
      },
      select: {
        period: true,
        teacherId: true,
        subject: { select: { teacherId: true } }
      }
    });

    // 5. Fetch already assigned substitutions on this date for these periods
    const assignedSubs = await prisma.substitution.findMany({
      where: {
        date: targetDate,
        status: "ASSIGNED",
        substituteTeacherId: { not: null }
      },
      include: {
        timetableEntry: { select: { period: true } }
      }
    });

    // Map: periodNumber -> Set of busy teacherIds
    const busyByPeriod = new Map<number, Set<string>>();
    for (const r of regularSlots) {
      const tId = r.teacherId || r.subject?.teacherId;
      if (tId) {
        if (!busyByPeriod.has(r.period)) busyByPeriod.set(r.period, new Set());
        busyByPeriod.get(r.period)!.add(tId);
      }
    }
    for (const s of assignedSubs) {
      if (s.substituteTeacherId) {
        const p = s.timetableEntry.period;
        if (!busyByPeriod.has(p)) busyByPeriod.set(p, new Set());
        busyByPeriod.get(p)!.add(s.substituteTeacherId);
      }
    }

    // 6. Fetch existing substitutions on these slots for this date
    const currentSubs = await prisma.substitution.findMany({
      where: {
        date: targetDate,
        timetableEntryId: { in: slots.map(s => s.id) }
      },
      include: {
        substituteTeacher: { include: { user: { select: { name: true } } } }
      }
    });
    const subMap = new Map<string, typeof currentSubs[0]>();
    currentSubs.forEach(s => subMap.set(s.timetableEntryId, s));

    // 7. Assemble period list with strictly-period-free teachers
    const periods: StaffShiftPeriodSlot[] = slots.map(slot => {
      const sub = subMap.get(slot.id);
      let status: StaffShiftPeriodSlot["status"] = "NOT_ASSIGNED";
      if (sub) {
        if (sub.status === "ASSIGNED" && sub.substituteTeacherId) {
          status = "ASSIGNED";
        } else if (sub.status === "UNASSIGNED" || (!sub.substituteTeacherId && sub.note?.includes("Free Period"))) {
          status = "FREE_PERIOD";
        }
      }

      const busyInThisPeriod = busyByPeriod.get(slot.period) || new Set<string>();

      // Filter teachers: not absent today, not the current teacher, and not busy in this period
      const freeTeachersForSlot = allTeachers
        .filter(t => !absentTeacherIds.has(t.id) && !busyInThisPeriod.has(t.id))
        .map(t => ({
          id: t.id,
          name: t.user.name || "Faculty Member",
          subjects: t.subjects.map(s => s.name)
        }));

      return {
        timetableEntryId: slot.id,
        period: slot.period,
        startTime: slot.startTime,
        endTime: slot.endTime,
        classId: slot.classId,
        className: `${slot.class.name} - ${slot.class.section}`,
        subjectId: slot.subjectId,
        subjectName: slot.subject?.name || "Subject",
        classroom: slot.classroom,
        status,
        substituteTeacherId: sub?.substituteTeacherId || null,
        substituteTeacherName: sub?.substituteTeacher?.user?.name || null,
        substitutionId: sub?.id || null,
        note: sub?.note || null,
        freeTeachers: freeTeachersForSlot
      };
    });

    return {
      success: true,
      teacher: { id: teacher.id, name: teacher.user.name || "Teacher" },
      date: dateStr,
      formattedDate: formatSchoolDate(targetDate),
      dayOfWeek,
      periods
    };
  } catch (error: any) {
    console.error("getStaffShiftPeriodsWithFreeTeachersAction error:", error);
    return {
      success: false,
      date: opts.dateStr,
      formattedDate: opts.dateStr,
      dayOfWeek: "",
      periods: [],
      error: error.message || "Failed to load staff shift periods."
    };
  }
}

/**
 * Saves staff shift class reassignments.
 * Allows Admin (for any staff) or Teacher (for their own assigned classes).
 * Upserts TeacherAbsence record, sets Substitutions, and notifies both staff members and parents.
 */
export async function saveStaffShiftBatchAction(data: {
  teacherId: string;
  dateStr: string;
  reason?: string;
  shifts: Array<{
    timetableEntryId: string;
    substituteTeacherId: string | null;
    isFreePeriod?: boolean;
    note?: string;
  }>;
}): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (!session) {
      return { success: false, error: "Unauthorized: Please log in." };
    }

    const { teacherId, dateStr, reason = "Staff Shift", shifts } = data;
    if (!teacherId) return { success: false, error: "Please select a staff member." };
    if (!dateStr) return { success: false, error: "Please specify the date." };
    if (!shifts || shifts.length === 0) {
      return { success: false, error: "No classes selected for shift." };
    }

    const isAdmin = session.user.role === "ADMIN";
    const isTeacher = session.user.role === "TEACHER";

    if (!isAdmin && !isTeacher) {
      return { success: false, error: "Unauthorized: Staff or Admin role required." };
    }

    // If teacher, verify they own this teacher profile
    if (isTeacher) {
      const teacherProfile = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true }
      });
      if (!teacherProfile || teacherProfile.id !== teacherId) {
        return { success: false, error: "You can only reassign your own class schedule." };
      }
    }

    const targetDate = normalizeDateToUTC(dateStr);
    const formattedDate = formatSchoolDate(targetDate);

    // Get original teacher details
    const origTeacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      include: { user: true }
    });
    const origTeacherName = origTeacher?.user?.name || "Faculty Member";

    // Track notifications to dispatch
    const notificationQueue: Array<{ userId: string; title: string; content: string; link: string }> = [];

    // Find all scheduled slots for teacher on this day to know if it's full day
    const dayOfWeek = DAYS_OF_WEEK[targetDate.getUTCDay()];
    const totalTeacherSlots = await prisma.timetable.count({
      where: {
        dayOfWeek,
        isBreak: false,
        OR: [
          { teacherId },
          { subject: { teacherId } }
        ]
      }
    });

    const isFullDay = shifts.length >= totalTeacherSlots;

    await prisma.$transaction(async (tx) => {
      // 1. Create or update TeacherAbsence record
      let absence = await tx.teacherAbsence.findFirst({
        where: {
          teacherId,
          date: targetDate,
          status: "ACTIVE"
        }
      });

      if (!absence) {
        absence = await tx.teacherAbsence.create({
          data: {
            teacherId,
            date: targetDate,
            fullDay: isFullDay,
            reason: reason || "Staff Shift",
            source: isAdmin ? "ADMIN_MARKED" : "TEACHER_SHIFT",
            status: "ACTIVE"
          }
        });
      } else {
        await tx.teacherAbsence.update({
          where: { id: absence.id },
          data: {
            reason: reason || absence.reason,
            fullDay: isFullDay || absence.fullDay
          }
        });
      }

      // 2. Process each shifted class slot
      for (const item of shifts) {
        const slot = await tx.timetable.findUnique({
          where: { id: item.timetableEntryId },
          include: {
            class: {
              include: {
                students: {
                  select: {
                    parents: {
                      select: {
                        parent: { select: { userId: true } }
                      }
                    }
                  }
                }
              }
            },
            subject: true
          }
        });

        if (!slot) continue;

        const isFree = Boolean(item.isFreePeriod) || !item.substituteTeacherId;
        const subTeacherId = isFree ? null : item.substituteTeacherId;
        const status = isFree ? "UNASSIGNED" : "ASSIGNED";
        const note = item.note || (isFree ? `Free Period (Staff Shift: ${reason})` : `Staff Shift: ${reason}`);

        // Upsert substitution
        const existing = await tx.substitution.findFirst({
          where: {
            date: targetDate,
            timetableEntryId: item.timetableEntryId
          }
        });

        if (existing) {
          await tx.substitution.update({
            where: { id: existing.id },
            data: {
              absentTeacherId: teacherId,
              substituteTeacherId: subTeacherId,
              absenceId: absence.id,
              status,
              note
            }
          });
        } else {
          await tx.substitution.create({
            data: {
              date: targetDate,
              timetableEntryId: item.timetableEntryId,
              absentTeacherId: teacherId,
              substituteTeacherId: subTeacherId,
              absenceId: absence.id,
              status,
              note
            }
          });
        }

        const className = `${slot.class.name} - ${slot.class.section}`;
        const subjectName = slot.subject?.name || "Class";

        // Notify Substitute Teacher
        if (subTeacherId) {
          const subTeacher = await tx.teacher.findUnique({
            where: { id: subTeacherId },
            include: { user: true }
          });

          if (subTeacher?.user?.id) {
            notificationQueue.push({
              userId: subTeacher.user.id,
              title: "Staff Shift: Class Duty Assigned",
              content: `You have been assigned Class ${className} - Period ${slot.period} (${subjectName}) on ${formattedDate}. Assigned by: ${origTeacherName}. Reason: ${reason}.`,
              link: "/dashboard/teacher/timetable"
            });
          }

          // If assigned by Admin, notify the original teacher
          if (isAdmin && origTeacher?.user?.id) {
            notificationQueue.push({
              userId: origTeacher.user.id,
              title: "Staff Shift Updated by Admin",
              content: `Your Class ${className} - Period ${slot.period} on ${formattedDate} has been shifted to ${subTeacher?.user?.name || "Substitute Teacher"}. Reason: ${reason}.`,
              link: "/dashboard/teacher/timetable"
            });
          }

          // If assigned by Teacher, notify Admin users
          if (!isAdmin) {
            const adminUsers = await tx.user.findMany({
              where: { role: "ADMIN", status: "ACTIVE" },
              select: { id: true }
            });
            for (const admin of adminUsers) {
              notificationQueue.push({
                userId: admin.id,
                title: "Staff Shift Notification",
                content: `${origTeacherName} has shifted Class ${className} - Period ${slot.period} (${subjectName}) to ${subTeacher?.user?.name || "substitute"} on ${formattedDate}. Reason: ${reason}.`,
                link: "/dashboard/admin/timetable/substitution"
              });
            }
          }

          // Notify Class Parents
          for (const st of slot.class.students) {
            for (const ps of st.parents) {
              if (ps.parent?.userId) {
                notificationQueue.push({
                  userId: ps.parent.userId,
                  title: "Class Schedule Update",
                  content: `${subjectName} on ${formattedDate} (Period ${slot.period}) will be covered by ${subTeacher?.user?.name || "Faculty"}.`,
                  link: "/dashboard/parent/timetable"
                });
              }
            }
          }
        }
      }

      // Log Audit
      await tx.timetableAudit.create({
        data: {
          action: "SUBSTITUTE",
          userId: session.user.id,
          details: `Staff shift by ${session.user.name || session.user.role}: ${origTeacherName} reassigned ${shifts.length} classes on ${dateStr}. Reason: ${reason}`
        }
      }).catch(err => console.warn("Audit log warning:", err));
    });

    // Send notifications in parallel background
    Promise.all(
      notificationQueue.map(n => sendNotification(n.userId, n.title, n.content, n.link))
    ).catch(err => console.warn("Error sending staff shift notifications:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent");
    revalidatePath("/dashboard/parent/timetable");

    return { success: true, count: shifts.length };
  } catch (error: any) {
    console.error("saveStaffShiftBatchAction error:", error);
    return { success: false, error: error.message || "Failed to save staff shift." };
  }
}
