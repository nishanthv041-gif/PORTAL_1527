"use server";

import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { revalidatePath } from "next/cache";

const DAYS_OF_WEEK = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export interface CandidateSubstitute {
  teacherId: string;
  teacherName: string;
  email?: string;
  department?: string;
  subjectsTaught: string[];
  periodsToday: number;
  periodsThisWeek: number;
  isSameSubject: boolean;
  isSameClass: boolean;
  score: number;
  matchBadge: "Best Match" | "Subject Specialist" | "Class Teacher" | "Free";
}

/**
 * Returns the day of week string for a given date
 */
function getDayOfWeekName(date: Date): string {
  return DAYS_OF_WEEK[date.getDay()];
}

/**
 * Marks a teacher absent for a given date and generates pending substitution slots
 */
export async function markTeacherAbsenceAction(data: {
  teacherId: string;
  dateStr: string; // YYYY-MM-DD
  fullDay?: boolean;
  periodNumbers?: number[];
  reason?: string;
  source?: string;
}) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  const { teacherId, dateStr, fullDay = true, periodNumbers, reason, source = "ADMIN_MARKED" } = data;
  if (!teacherId || !dateStr) {
    return { success: false, error: "Teacher ID and date are required." };
  }

  try {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dayOfWeek = getDayOfWeekName(targetDate);

    // 1. Create or update TeacherAbsence record
    const absence = await prisma.teacherAbsence.create({
      data: {
        teacherId,
        date: targetDate,
        fullDay,
        periodNumbers: periodNumbers && periodNumbers.length > 0 ? periodNumbers.join(",") : null,
        reason: reason || "Unplanned absence",
        source,
        status: "ACTIVE"
      }
    });

    // 2. Find all timetable slots for this teacher on this day of week
    const affectedSlots = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false,
        OR: [
          { teacherId },
          { subject: { teacherId } }
        ],
        ...(periodNumbers && periodNumbers.length > 0 ? { period: { in: periodNumbers } } : {})
      },
      include: {
        class: true,
        subject: true
      }
    });

    // 3. For each affected slot, create a Substitution record
    let createdCount = 0;
    for (const slot of affectedSlots) {
      // Check if substitution already exists for this slot on this date
      const existingSub = await prisma.substitution.findFirst({
        where: {
          date: targetDate,
          timetableEntryId: slot.id
        }
      });

      if (!existingSub) {
        await prisma.substitution.create({
          data: {
            date: targetDate,
            timetableEntryId: slot.id,
            absentTeacherId: teacherId,
            absenceId: absence.id,
            status: "SUGGESTED"
          }
        });
        createdCount++;
      }
    }

    // 4. Log audit
    await prisma.timetableAudit.create({
      data: {
        action: "SUBSTITUTE",
        userId,
        details: `Teacher ${teacherId} marked absent on ${dateStr}. Created ${createdCount} substitution requirements.`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return {
      success: true,
      absenceId: absence.id,
      affectedSlotsCount: affectedSlots.length,
      createdCount
    };
  } catch (error: any) {
    console.error("markTeacherAbsenceAction error:", error);
    return { success: false, error: error.message || "Failed to mark teacher absence." };
  }
}

/**
 * Computes ranked candidates to substitute for a specific timetable slot on a specific date
 */
export async function getCandidatesForSubstitutionAction(timetableEntryId: string, dateStr: string): Promise<{
  success: boolean;
  candidates: CandidateSubstitute[];
  slotInfo?: any;
  error?: string;
}> {
  try {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dayOfWeek = getDayOfWeekName(targetDate);

    // 1. Fetch timetable slot
    const slot = await prisma.timetable.findUnique({
      where: { id: timetableEntryId },
      include: {
        class: true,
        subject: true,
        teacher: { include: { user: true } }
      }
    });

    if (!slot) {
      return { success: false, candidates: [], error: "Timetable slot not found." };
    }

    const absentTeacherId = slot.teacherId || slot.subject?.teacherId;
    const targetPeriod = slot.period;
    const targetClassId = slot.classId;
    const targetSubjectName = slot.subject?.name?.toLowerCase() || "";

    // 2. Fetch all teachers with user accounts and subjects they teach
    const allTeachers = await prisma.teacher.findMany({
      include: {
        user: true,
        subjects: true
      }
    });

    // 3. Find which teachers are absent on this date
    const absencesToday = await prisma.teacherAbsence.findMany({
      where: {
        date: targetDate,
        status: "ACTIVE"
      }
    });
    const absentTeacherIds = new Set(absencesToday.map(a => a.teacherId));

    // 4. Find all existing timetable slots on this dayOfWeek across the school
    const regularSlotsToday = await prisma.timetable.findMany({
      where: {
        dayOfWeek,
        isBreak: false
      },
      include: {
        subject: true
      }
    });

    // 5. Find substitutions already assigned to teachers on this specific date
    const assignedSubsToday = await prisma.substitution.findMany({
      where: {
        date: targetDate,
        status: "ASSIGNED",
        substituteTeacherId: { not: null }
      },
      include: {
        timetableEntry: true
      }
    });

    // Compute busy teachers in targetPeriod
    const busyTeacherIdsInPeriod = new Set<string>();

    for (const s of regularSlotsToday) {
      if (s.period === targetPeriod) {
        const tid = s.teacherId || s.subject?.teacherId;
        if (tid) busyTeacherIdsInPeriod.add(tid);
      }
    }

    for (const sub of assignedSubsToday) {
      if (sub.substituteTeacherId && sub.timetableEntry.period === targetPeriod) {
        busyTeacherIdsInPeriod.add(sub.substituteTeacherId);
      }
    }

    // Compute workloads for each teacher today
    const periodsTodayMap = new Map<string, number>();
    for (const s of regularSlotsToday) {
      const tid = s.teacherId || s.subject?.teacherId;
      if (tid) {
        periodsTodayMap.set(tid, (periodsTodayMap.get(tid) || 0) + 1);
      }
    }
    for (const sub of assignedSubsToday) {
      if (sub.substituteTeacherId) {
        periodsTodayMap.set(sub.substituteTeacherId, (periodsTodayMap.get(sub.substituteTeacherId) || 0) + 1);
      }
    }

    // 6. Rank candidate teachers who are free
    const candidates: CandidateSubstitute[] = [];

    for (const teacher of allTeachers) {
      // Must not be the absent teacher
      if (teacher.id === absentTeacherId) continue;
      // Must not be absent/on leave today
      if (absentTeacherIds.has(teacher.id)) continue;
      // Must not be busy during targetPeriod
      if (busyTeacherIdsInPeriod.has(teacher.id)) continue;

      const teacherSubjects = teacher.subjects.map(s => s.name.toLowerCase());
      const isSameSubject = teacherSubjects.some(sName =>
        sName === targetSubjectName ||
        sName.includes(targetSubjectName) ||
        targetSubjectName.includes(sName)
      );

      const isSameClass = teacher.subjects.some(s => s.classId === targetClassId);
      const periodsToday = periodsTodayMap.get(teacher.id) || 0;
      const maxPerDay = teacher.maxPeriodsPerDay || 6;

      // Scoring formula:
      // Subject match: +50
      // Class familiarity: +20
      // Light day workload: +5 per free period remaining
      let score = 10;
      if (isSameSubject) score += 50;
      if (isSameClass) score += 20;
      score += Math.max(0, (maxPerDay - periodsToday) * 5);

      let matchBadge: CandidateSubstitute["matchBadge"] = "Free";
      if (isSameSubject && score >= 70) matchBadge = "Best Match";
      else if (isSameSubject) matchBadge = "Subject Specialist";
      else if (isSameClass) matchBadge = "Class Teacher";

      candidates.push({
        teacherId: teacher.id,
        teacherName: teacher.user.name || "Teacher",
        email: teacher.user.email || undefined,
        subjectsTaught: teacher.subjects.map(s => s.name),
        periodsToday,
        periodsThisWeek: (teacher.maxPeriodsPerWeek || 30) - 10,
        isSameSubject,
        isSameClass,
        score,
        matchBadge
      });
    }

    // Sort descending by score, then ascending by periodsToday
    candidates.sort((a, b) => b.score - a.score || a.periodsToday - b.periodsToday);

    return {
      success: true,
      candidates,
      slotInfo: {
        id: slot.id,
        period: slot.period,
        startTime: slot.startTime,
        endTime: slot.endTime,
        className: `${slot.class.name} - ${slot.class.section}`,
        subjectName: slot.subject?.name || "Subject",
        absentTeacherName: slot.teacher?.user?.name || "Original Teacher"
      }
    };
  } catch (error: any) {
    console.error("getCandidatesForSubstitutionAction error:", error);
    return { success: false, candidates: [], error: error.message || "Failed to find candidates" };
  }
}

/**
 * Assigns a substitute teacher to a substitution requirement
 */
export async function assignSubstituteAction(data: {
  substitutionId: string;
  substituteTeacherId: string;
  note?: string;
}) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  const { substitutionId, substituteTeacherId, note } = data;
  if (!substitutionId || !substituteTeacherId) {
    return { success: false, error: "Substitution ID and substitute teacher are required." };
  }

  try {
    const sub = await prisma.substitution.findUnique({
      where: { id: substitutionId },
      include: {
        timetableEntry: { include: { class: true, subject: true } },
        absentTeacher: { include: { user: true } }
      }
    });

    if (!sub) {
      return { success: false, error: "Substitution entry not found." };
    }

    // Check if substitute is already teaching in this period on this date
    const targetPeriod = sub.timetableEntry.period;
    const targetDate = sub.date;
    const dayOfWeek = sub.timetableEntry.dayOfWeek;

    const existingSlot = await prisma.timetable.findFirst({
      where: {
        dayOfWeek,
        period: targetPeriod,
        isBreak: false,
        OR: [
          { teacherId: substituteTeacherId },
          { subject: { teacherId: substituteTeacherId } }
        ]
      }
    });

    const otherAssignedSub = await prisma.substitution.findFirst({
      where: {
        date: targetDate,
        substituteTeacherId,
        id: { not: substitutionId },
        timetableEntry: { period: targetPeriod }
      }
    });

    if (existingSlot || otherAssignedSub) {
      return {
        success: false,
        error: "Cannot assign substitute: Selected teacher is already scheduled for another class in this period."
      };
    }

    // Update substitution
    await prisma.substitution.update({
      where: { id: substitutionId },
      data: {
        substituteTeacherId,
        status: "ASSIGNED",
        note: note || `Covering for ${sub.absentTeacher?.user?.name || 'teacher'}`
      }
    });

    // Audit log
    await prisma.timetableAudit.create({
      data: {
        action: "SUBSTITUTE",
        classId: sub.timetableEntry.classId,
        userId,
        details: `Assigned substitute ${substituteTeacherId} for ${sub.timetableEntry.dayOfWeek} P${targetPeriod}`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true };
  } catch (error: any) {
    console.error("assignSubstituteAction error:", error);
    return { success: false, error: error.message || "Failed to assign substitute." };
  }
}

/**
 * Cancels a teacher's absence and cleanly reverts substitutions without corrupting base timetable
 */
export async function cancelAbsenceAction(absenceId: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!absenceId) return { success: false, error: "Absence ID required" };

  try {
    const absence = await prisma.teacherAbsence.findUnique({
      where: { id: absenceId }
    });

    if (!absence) return { success: false, error: "Absence not found" };

    // 1. Delete associated substitutions so base timetable slots immediately revert
    await prisma.substitution.deleteMany({
      where: { absenceId }
    });

    // 2. Mark absence cancelled
    await prisma.teacherAbsence.update({
      where: { id: absenceId },
      data: { status: "CANCELLED" }
    });

    // 3. Log audit
    await prisma.timetableAudit.create({
      data: {
        action: "SUBSTITUTE",
        userId,
        details: `Cancelled absence ${absenceId} for teacher ${absence.teacherId}`
      }
    }).catch(err => console.warn("Audit log warning:", err));

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true };
  } catch (error: any) {
    console.error("cancelAbsenceAction error:", error);
    return { success: false, error: error.message || "Failed to cancel absence" };
  }
}

/**
 * Auto-assigns best available candidates to all unassigned substitutions on a date
 */
export async function autoAssignAllSubstitutionsAction(dateStr: string) {
  const session = await getServerSession(getAuthOptions());
  const userId = session?.user?.id || "admin";

  if (!dateStr) return { success: false, error: "Date is required" };

  try {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

    const pendingSubs = await prisma.substitution.findMany({
      where: {
        date: targetDate,
        status: { in: ["SUGGESTED", "UNASSIGNED"] },
        substituteTeacherId: null
      },
      include: {
        timetableEntry: true
      }
    });

    let assignedCount = 0;
    for (const sub of pendingSubs) {
      const candidatesRes = await getCandidatesForSubstitutionAction(sub.timetableEntryId, dateStr);
      if (candidatesRes.success && candidatesRes.candidates.length > 0) {
        const topCandidate = candidatesRes.candidates[0];
        await prisma.substitution.update({
          where: { id: sub.id },
          data: {
            substituteTeacherId: topCandidate.teacherId,
            status: "ASSIGNED",
            note: "Auto-assigned by smart scheduling algorithm"
          }
        });
        assignedCount++;
      }
    }

    revalidatePath("/dashboard/admin/timetable");
    revalidatePath("/dashboard/admin/timetable/substitution");
    revalidatePath("/dashboard/teacher/timetable");
    revalidatePath("/dashboard/parent/timetable");
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/parent");

    return { success: true, count: assignedCount };
  } catch (error: any) {
    console.error("autoAssignAllSubstitutionsAction error:", error);
    return { success: false, error: error.message || "Failed to auto-assign substitutions" };
  }
}

export interface SubstitutionDataResult {
  success: boolean;
  date: string;
  error?: string;
  absences: Array<{
    id: string;
    teacherId: string;
    teacherName: string;
    fullDay: boolean;
    periodNumbers: string | null;
    reason: string | null;
    source: string;
  }>;
  substitutions: Array<{
    id: string;
    date: string;
    period: number;
    startTime: string;
    endTime: string;
    className: string;
    classId: string;
    subjectName: string;
    absentTeacherId: string;
    absentTeacherName: string;
    substituteTeacherId: string | null;
    substituteTeacherName: string | null;
    status: string;
    note: string | null;
  }>;
  allTeachers: Array<{
    id: string;
    name: string;
  }>;
}

/**
 * Retrieves all absences, substitutions, and status summaries for a date
 */
export async function getSubstitutionDataForDateAction(dateStr: string): Promise<SubstitutionDataResult> {
  try {
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

    const [absences, substitutions, allTeachers] = await Promise.all([
      prisma.teacherAbsence.findMany({
        where: {
          date: targetDate,
          status: "ACTIVE"
        },
        include: {
          teacher: { include: { user: true } }
        }
      }),
      prisma.substitution.findMany({
        where: { date: targetDate },
        include: {
          timetableEntry: {
            include: {
              class: true,
              subject: true
            }
          },
          absentTeacher: { include: { user: true } },
          substituteTeacher: { include: { user: true } }
        },
        orderBy: {
          timetableEntry: { period: "asc" }
        }
      }),
      prisma.teacher.findMany({
        include: { user: true }
      })
    ]);

    return {
      success: true,
      date: dateStr,
      absences: absences.map(a => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: a.teacher.user.name || "Teacher",
        fullDay: a.fullDay,
        periodNumbers: a.periodNumbers,
        reason: a.reason,
        source: a.source
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
        name: t.user.name || "Teacher"
      }))
    };
  } catch (error: any) {
    console.error("getSubstitutionDataForDateAction error:", error);
    return { success: false, error: error.message || "Failed to load substitution data", date: dateStr, absences: [], substitutions: [], allTeachers: [] };
  }
}
