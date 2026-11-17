import { prisma } from "@/backend/db/prisma";
import { Prisma } from "@prisma/client";
import {
  getTodayIST,
  isBirthdayToday,
  isBirthdayInPastDays,
  isLeapYear,
  parseDobToParts,
} from "@/lib/birthday";
import {
  serializeBirthdayCardPayload,
  buildBirthdaySummaryText,
  BirthdayCardPayload,
} from "@/frontend/components/birthdays/birthdayCardUtils";
import { sendUniversalNotification } from "@/lib/notify";
import { formatClassName } from "@/lib/teacher/formatClassName";

export interface CelebrantRecipient {
  userId: string;
  audience: "STUDENT_SELF" | "PARENT_OF_STUDENT" | "TEACHER" | "STAFF" | "ADMIN" | "PARENT_SELF";
}

export interface TargetCelebrant {
  personType: "student" | "teacher" | "staff" | "admin" | "parent" | "driver";
  personId: string;
  name: string;
  className?: string;
  classId?: string;
  isLate?: boolean;
  recipients: CelebrantRecipient[];
}

export interface ProcessBirthdayResult {
  success: boolean;
  forDate: string;
  status: string;
  eligibleCount: number;
  sentCount: number;
  skippedAlreadySent: number;
  skippedNoAccount: number;
  failedCount: number;
  lateWishesSent: number;
  durationMs: number;
  error?: string;
}

/**
 * Core engine to dispatch birthday greetings for all celebrants born today in Asia/Kolkata.
 * Strictly awaited, multi-platform (In-app + PC/iOS Web Push + Android FCM), and fully idempotent.
 */
export async function processUniversalBirthdayWishes(
  customDate?: { year: number; month: number; day: number },
  triggeredBy: string = "scheduler",
  includeCatchUp: boolean = true
): Promise<ProcessBirthdayResult> {
  const startTime = Date.now();
  const todayIST = getTodayIST();
  const year = customDate?.year ?? todayIST.year;
  const month = customDate?.month ?? todayIST.month;
  const day = customDate?.day ?? todayIST.day;

  const forDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // 1. Fetch Master Birthday Settings
  let settings = await prisma.birthdaySettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    settings = await prisma.birthdaySettings.create({
      data: { id: "default" },
    });
  }

  // School name branding
  const schoolSetting = await prisma.systemSetting.findUnique({
    where: { key: "SCHOOL_NAME" },
  }).catch(() => null);
  const schoolNameSetting = schoolSetting?.value || "SRT SCHOOL";

  // Master switch disabled check
  if (!settings.enabled) {
    await prisma.birthdayJobRun.create({
      data: {
        forDate,
        sentCount: 0,
        skippedAlreadySent: 0,
        skippedNoAccount: 0,
        failedCount: 0,
        durationMs: Date.now() - startTime,
        triggeredBy,
      },
    }).catch(() => {});

    return {
      success: true,
      forDate,
      status: "DISABLED",
      eligibleCount: 0,
      sentCount: 0,
      skippedAlreadySent: 0,
      skippedNoAccount: 0,
      failedCount: 0,
      lateWishesSent: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // 2. Query Celebrants Across All Roles
  const celebrants: TargetCelebrant[] = [];
  const lateCelebrants: TargetCelebrant[] = [];

  // A. Students
  if (settings.notifyParents || settings.notifyStudents) {
    const students = await prisma.student.findMany({
      where: {
        dateOfBirth: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        classId: true,
        class: { select: { name: true, section: true } },
        parents: {
          select: {
            parent: {
              select: {
                userId: true,
                user: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });

    for (const student of students) {
      if (!student.dateOfBirth) continue;
      const isToday = isBirthdayToday(student.dateOfBirth, { year, month, day });
      const pastMatch = !isToday && includeCatchUp ? isBirthdayInPastDays(student.dateOfBirth, 2) : null;
      const isLatePast = Boolean(pastMatch);

      if (isToday || isLatePast) {
        const studentName = `${student.firstName} ${student.lastName || ""}`.trim();
        const className = student.class ? formatClassName(student.class.name, student.class.section) : undefined;
        const recipients: CelebrantRecipient[] = [];

        if (settings.notifyParents) {
          for (const rel of student.parents) {
            if (rel.parent?.userId && rel.parent.user?.status === "ACTIVE") {
              recipients.push({
                userId: rel.parent.userId,
                audience: "PARENT_OF_STUDENT",
              });
            }
          }
        }

        const celebrantObj: TargetCelebrant = {
          personType: "student",
          personId: student.id,
          name: studentName,
          className,
          classId: student.classId || undefined,
          isLate: isLatePast,
          recipients,
        };

        if (isToday) celebrants.push(celebrantObj);
        else lateCelebrants.push(celebrantObj);
      }
    }
  }

  // B. Teachers
  if (settings.notifyTeachers) {
    const teachers = await prisma.teacher.findMany({
      where: {
        OR: [
          { dateOfBirth: { not: null } },
          { user: { dateOfBirth: { not: null } } },
        ],
      },
      select: {
        id: true,
        userId: true,
        dateOfBirth: true,
        user: { select: { id: true, name: true, dateOfBirth: true, status: true } },
      },
    });

    for (const teacher of teachers) {
      const dob = teacher.dateOfBirth || teacher.user?.dateOfBirth;
      if (!dob || teacher.user?.status !== "ACTIVE") continue;

      const isToday = isBirthdayToday(dob, { year, month, day });
      const pastMatch = !isToday && includeCatchUp ? isBirthdayInPastDays(dob, 2) : null;
      const isLatePast = Boolean(pastMatch);

      if ((isToday || isLatePast) && teacher.userId) {
        const celebrantObj: TargetCelebrant = {
          personType: "teacher",
          personId: teacher.id,
          name: teacher.user.name || "Teacher",
          isLate: isLatePast,
          recipients: [{ userId: teacher.userId, audience: "TEACHER" }],
        };
        if (isToday) celebrants.push(celebrantObj);
        else lateCelebrants.push(celebrantObj);
      }
    }
  }

  // Combine target list
  const allTargets = [...celebrants, ...lateCelebrants];
  const eligibleCount = allTargets.length;

  let sentCount = 0;
  let skippedAlreadySent = 0;
  let skippedNoAccount = 0;
  let failedCount = 0;
  let lateWishesSent = 0;

  // 3. Batched Processing in chunks of 25 for serverless connection stability
  const BATCH_SIZE = 25;
  for (let i = 0; i < allTargets.length; i += BATCH_SIZE) {
    const batch = allTargets.slice(i, i + BATCH_SIZE);

    for (const celebrant of batch) {
      if (celebrant.recipients.length === 0) {
        skippedNoAccount++;
        continue;
      }

      const cardPayload: BirthdayCardPayload = {
        recipientName: celebrant.name,
        classNameLabel: celebrant.className,
        deityName: settings.deityName || "Amman",
        cardLine1: settings.cardLine1 || "I have great pleasure in conveying my best wishes on the eve of your birthday",
        cardLine2: (settings.cardLine2 || "My prayers are to {deityName} to bless you with peace, prosperity and happiness").replace(
          /{deityName}/g,
          settings.deityName || "Amman"
        ),
        senderName: settings.senderName || "PRANAV.J",
        senderDesignation: settings.senderDesignation || "Correspondent",
        schoolName: schoolNameSetting,
        schoolLogo: "/logo/srt-logo.svg",
        schoolTagline: "UNIVERSAL SCHOOL",
        ammanPhotoUrl: "/assets/birthday/amman.jpg",
        summaryText: buildBirthdaySummaryText({
          recipientName: celebrant.name,
          senderName: settings.senderName || "PRANAV.J",
          senderDesignation: settings.senderDesignation || "Correspondent",
          schoolName: schoolNameSetting,
          deityName: settings.deityName || "Amman",
        }),
      };

      const notificationContent = serializeBirthdayCardPayload(cardPayload);

      for (const recipient of celebrant.recipients) {
        try {
          const existingLog = await prisma.birthdayWishLog.findUnique({
            where: {
              userId_year: {
                userId: recipient.userId,
                year,
              },
            },
          });

          if (existingLog) {
            skippedAlreadySent++;
            continue;
          }

          const notifResult = await sendUniversalNotification({
            userId: recipient.userId,
            title: `Happy Birthday, ${celebrant.name}! 🎂`,
            body: cardPayload.summaryText,
            content: notificationContent,
            category: "BIRTHDAY",
            url: recipient.audience.startsWith("PARENT") ? "/dashboard/parent" : "/dashboard",
            tag: `birthday-${recipient.userId}-${year}`,
            priority: "NORMAL",
          });

          await prisma.birthdayWishLog.create({
            data: {
              userId: recipient.userId,
              year,
              status: "SENT",
              isLate: !!celebrant.isLate,
            },
          });

          await prisma.birthdayWish.create({
            data: {
              audience: recipient.audience,
              personType: celebrant.personType,
              personId: celebrant.personId,
              studentId: celebrant.personType === "student" ? celebrant.personId : null,
              recipientUserId: recipient.userId,
              year,
              notificationId: notifResult.notificationId || null,
              status: "SENT",
            },
          });

          sentCount++;
          if (celebrant.isLate) lateWishesSent++;
        } catch (err) {
          failedCount++;
          console.error(`[Birthday Service] Failed sending wish for ${celebrant.name}:`, err);
        }
      }
    }
  }

  const durationMs = Date.now() - startTime;

  await prisma.birthdayJobRun.create({
    data: {
      forDate,
      sentCount,
      skippedAlreadySent,
      skippedNoAccount,
      failedCount,
      durationMs,
      triggeredBy,
    },
  }).catch(() => {});

  return {
    success: failedCount === 0 || sentCount > 0,
    forDate,
    status: "COMPLETED",
    eligibleCount,
    sentCount,
    skippedAlreadySent,
    skippedNoAccount,
    failedCount,
    lateWishesSent,
    durationMs,
  };
}

/**
 * Dispatches an immediate birthday wish for a single person when their DOB is entered/saved.
 */
export async function dispatchImmediateBirthdayWishForPerson(params: {
  personType: "student" | "teacher" | "staff" | "admin" | "parent" | "driver" | string;
  personId: string;
  classId?: string;
  forceSend?: boolean;
}): Promise<{ success: boolean; sentCount: number; isBirthdayToday: boolean; message: string }> {
  const todayIST = getTodayIST();
  const year = todayIST.year;

  let settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.birthdaySettings.create({ data: { id: "default" } });
  }

  if (!settings.enabled) {
    return { success: true, sentCount: 0, isBirthdayToday: false, message: "Birthday system disabled." };
  }

  const schoolSetting = await prisma.systemSetting.findUnique({ where: { key: "SCHOOL_NAME" } }).catch(() => null);
  const schoolNameSetting = schoolSetting?.value || "SRT SCHOOL";

  const pType = params.personType.toLowerCase();
  let celebrantName = "";
  let classNameLabel: string | undefined;
  let dateOfBirth: Date | null = null;
  const recipients: CelebrantRecipient[] = [];

  if (pType === "student") {
    const student = await prisma.student.findUnique({
      where: { id: params.personId },
      include: {
        class: { select: { name: true, section: true } },
        parents: {
          include: {
            parent: {
              include: { user: { select: { id: true, status: true } } },
            },
          },
        },
      },
    });

    if (!student || !student.dateOfBirth) {
      return { success: true, sentCount: 0, isBirthdayToday: false, message: "No Date of Birth on file." };
    }

    celebrantName = `${student.firstName} ${student.lastName || ""}`.trim();
    classNameLabel = student.class ? formatClassName(student.class.name, student.class.section) : undefined;
    dateOfBirth = student.dateOfBirth;

    if (settings.notifyParents) {
      for (const rel of student.parents) {
        if (rel.parent?.userId && rel.parent.user?.status === "ACTIVE") {
          recipients.push({ userId: rel.parent.userId, audience: "PARENT_OF_STUDENT" });
        }
      }
    }
  } else if (pType === "teacher") {
    const teacher = await prisma.teacher.findUnique({
      where: { id: params.personId },
      include: { user: { select: { id: true, name: true, status: true, dateOfBirth: true } } },
    });
    dateOfBirth = teacher?.dateOfBirth || teacher?.user?.dateOfBirth || null;
    celebrantName = teacher?.user?.name || "Teacher";
    if (teacher?.userId) {
      recipients.push({ userId: teacher.userId, audience: "TEACHER" });
    }
  } else if (pType === "staff") {
    const staff = await prisma.staff.findUnique({
      where: { id: params.personId },
      include: { user: { select: { id: true, name: true, status: true, dateOfBirth: true } } },
    });
    dateOfBirth = staff?.dateOfBirth || staff?.user?.dateOfBirth || null;
    celebrantName = staff?.user?.name || "Staff";
    if (staff?.userId) {
      recipients.push({ userId: staff.userId, audience: "STAFF" });
    }
  } else if (pType === "admin") {
    const admin = await prisma.user.findUnique({
      where: { id: params.personId },
      select: { id: true, name: true, dateOfBirth: true },
    });
    dateOfBirth = admin?.dateOfBirth || null;
    celebrantName = admin?.name || "Admin";
    if (admin?.id) {
      recipients.push({ userId: admin.id, audience: "ADMIN" });
    }
  } else if (pType === "parent") {
    const parent = await prisma.parent.findUnique({
      where: { id: params.personId },
      include: { user: { select: { id: true, name: true, status: true, dateOfBirth: true } } },
    });
    dateOfBirth = parent?.dateOfBirth || parent?.user?.dateOfBirth || null;
    celebrantName = parent?.user?.name || "Parent";
    if (parent?.userId) {
      recipients.push({ userId: parent.userId, audience: "PARENT_SELF" });
    }
  }

  if (!dateOfBirth || !isBirthdayToday(dateOfBirth)) {
    return {
      success: true,
      sentCount: 0,
      isBirthdayToday: false,
      message: "Date of Birth saved successfully.",
    };
  }

  let sentCount = 0;
  const cardPayload: BirthdayCardPayload = {
    recipientName: celebrantName,
    classNameLabel,
    deityName: settings.deityName || "Amman",
    cardLine1: settings.cardLine1 || "I have great pleasure in conveying my best wishes on the eve of your birthday",
    cardLine2: (settings.cardLine2 || "My prayers are to {deityName} to bless you with peace, prosperity and happiness").replace(
      /{deityName}/g,
      settings.deityName || "Amman"
    ),
    senderName: settings.senderName || "PRANAV.J",
    senderDesignation: settings.senderDesignation || "Correspondent",
    schoolName: schoolNameSetting,
    schoolLogo: "/logo/srt-logo.svg",
    schoolTagline: "UNIVERSAL SCHOOL",
    ammanPhotoUrl: "/assets/birthday/amman.jpg",
    summaryText: buildBirthdaySummaryText({
      recipientName: celebrantName,
      senderName: settings.senderName || "PRANAV.J",
      senderDesignation: settings.senderDesignation || "Correspondent",
      schoolName: schoolNameSetting,
      deityName: settings.deityName || "Amman",
    }),
  };

  const notificationContent = serializeBirthdayCardPayload(cardPayload);

  for (const recipient of recipients) {
    const existing = await prisma.birthdayWishLog.findUnique({
      where: { userId_year: { userId: recipient.userId, year } },
    });

    if (!existing || params.forceSend) {
      const notifResult = await sendUniversalNotification({
        userId: recipient.userId,
        title: `Happy Birthday, ${celebrantName}! 🎂`,
        body: cardPayload.summaryText,
        content: notificationContent,
        category: "BIRTHDAY",
        url: recipient.audience.startsWith("PARENT") ? "/dashboard/parent" : "/dashboard",
        tag: `birthday-${recipient.userId}-${year}`,
        priority: "NORMAL",
      });

      if (!existing) {
        await prisma.birthdayWishLog.create({
          data: {
            userId: recipient.userId,
            year,
            status: "SENT",
            isLate: false,
          },
        });

        await prisma.birthdayWish.create({
          data: {
            audience: recipient.audience,
            personType: pType,
            personId: params.personId,
            studentId: pType === "student" ? params.personId : null,
            recipientUserId: recipient.userId,
            year,
            notificationId: notifResult.notificationId || null,
            status: "SENT",
          },
        });
      }
      sentCount++;
    }
  }

  return {
    success: true,
    sentCount,
    isBirthdayToday: true,
    message: `Birthday greetings dispatched immediately for ${celebrantName}! 🎉`,
  };
}
