import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/db/prisma";
import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
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

export const dynamic = "force-dynamic";

/**
 * Constant-time string comparison to defend against timing attacks on CRON_SECRET.
 */
function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Authorization guard:
 * Accepts:
 *  1. Header `Authorization: Bearer <CRON_SECRET>` (Standard Vercel Cron invocation)
 *  2. Header `x-cron-secret: <CRON_SECRET>`
 *  3. Authenticated session with role ADMIN (Admin testing / manual trigger)
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronSecret && (safeCompare(authHeader, cronSecret) || safeCompare(cronHeader, cronSecret))) {
    return true;
  }

  try {
    const session = await getServerSession(getAuthOptions());
    if (session?.user?.role === "ADMIN") {
      return true;
    }
  } catch {}

  return false;
}

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

  // 1. Fetch Birthday Settings
  let settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.birthdaySettings.create({ data: { id: "default" } });
  }

  const schoolSetting = await prisma.systemSetting.findUnique({ where: { key: "SCHOOL_NAME" } }).catch(() => null);
  const schoolNameSetting = schoolSetting?.value || "SRT SCHOOL";

  // If master switch disabled, record job run and exit cleanly
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

  // 2. Query celebrants across all roles
  const celebrants: TargetCelebrant[] = [];
  const targetDateRef = { year, month, day };

  // A. STUDENTS
  if (settings.notifyParents || settings.notifyStudents) {
    const students = await prisma.student.findMany({
      where: {
        isActive: true,
        dateOfBirth: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        rollNumber: true,
        classId: true,
        class: { select: { name: true, section: true } },
        parents: {
          select: {
            parent: {
              select: {
                id: true,
                userId: true,
                user: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });

    for (const st of students) {
      const isToday = isBirthdayToday(st.dateOfBirth, targetDateRef);
      const pastCheck = !isToday && includeCatchUp ? isBirthdayInPastDays(st.dateOfBirth, 2) : null;

      if (isToday || pastCheck) {
        const studentName = `${st.firstName} ${st.lastName || ""}`.trim();
        const clsName = st.class?.name ? formatClassName(st.class.name, st.class.section) : undefined;
        const recipients: CelebrantRecipient[] = [];

        // Parent recipient(s)
        if (settings.notifyParents) {
          for (const rel of st.parents) {
            if (rel.parent?.userId && rel.parent.user?.status === "ACTIVE") {
              recipients.push({
                userId: rel.parent.userId,
                audience: "PARENT_OF_STUDENT",
              });
            }
          }
        }

        // Student recipient (if direct user account exists)
        if (settings.notifyStudents) {
          const studentUser = await prisma.user.findFirst({
            where: {
              role: "STUDENT",
              status: "ACTIVE",
              OR: [
                { email: { contains: st.rollNumber, mode: "insensitive" } },
                { name: { equals: studentName, mode: "insensitive" } },
              ],
            },
            select: { id: true },
          }).catch(() => null);

          if (studentUser) {
            recipients.push({
              userId: studentUser.id,
              audience: "STUDENT_SELF",
            });
          }
        }

        celebrants.push({
          personType: "student",
          personId: st.id,
          name: studentName,
          className: clsName,
          classId: st.classId || undefined,
          isLate: Boolean(pastCheck),
          recipients,
        });
      }
    }
  }

  // B. TEACHERS
  if (settings.notifyTeachers) {
    const teachers = await prisma.teacher.findMany({
      where: {
        isActive: true,
        OR: [{ dateOfBirth: { not: null } }, { user: { dateOfBirth: { not: null } } }],
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        userId: true,
        dateOfBirth: true,
        user: { select: { id: true, name: true, dateOfBirth: true } },
      },
    });

    for (const t of teachers) {
      const effectiveDob = t.dateOfBirth || t.user?.dateOfBirth;
      const isToday = isBirthdayToday(effectiveDob, targetDateRef);
      const pastCheck = !isToday && includeCatchUp ? isBirthdayInPastDays(effectiveDob, 2) : null;

      if (isToday || pastCheck) {
        celebrants.push({
          personType: "teacher",
          personId: t.id,
          name: t.user?.name || "Teacher",
          isLate: Boolean(pastCheck),
          recipients: [{ userId: t.userId, audience: "TEACHER" }],
        });
      }
    }
  }

  // C. STAFF
  if (settings.notifyStaff) {
    const staffMembers = await prisma.staff.findMany({
      where: {
        isActive: true,
        OR: [{ dateOfBirth: { not: null } }, { user: { dateOfBirth: { not: null } } }],
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        userId: true,
        dateOfBirth: true,
        user: { select: { id: true, name: true, dateOfBirth: true } },
      },
    });

    for (const st of staffMembers) {
      const effectiveDob = st.dateOfBirth || st.user?.dateOfBirth;
      const isToday = isBirthdayToday(effectiveDob, targetDateRef);
      const pastCheck = !isToday && includeCatchUp ? isBirthdayInPastDays(effectiveDob, 2) : null;

      if (isToday || pastCheck) {
        celebrants.push({
          personType: "staff",
          personId: st.id,
          name: st.user?.name || "Staff Member",
          isLate: Boolean(pastCheck),
          recipients: [{ userId: st.userId, audience: "STAFF" }],
        });
      }
    }
  }

  // D. ADMINS
  if (settings.notifyAdmins) {
    const admins = await prisma.user.findMany({
      where: {
        role: "ADMIN",
        status: "ACTIVE",
        dateOfBirth: { not: null },
      },
      select: { id: true, name: true, dateOfBirth: true },
    });

    for (const adm of admins) {
      const isToday = isBirthdayToday(adm.dateOfBirth, targetDateRef);
      const pastCheck = !isToday && includeCatchUp ? isBirthdayInPastDays(adm.dateOfBirth, 2) : null;

      if (isToday || pastCheck) {
        celebrants.push({
          personType: "admin",
          personId: adm.id,
          name: adm.name || "Administrator",
          isLate: Boolean(pastCheck),
          recipients: [{ userId: adm.id, audience: "ADMIN" }],
        });
      }
    }
  }

  // E. PARENTS (Own Birthday)
  if (settings.notifyParents) {
    const parents = await prisma.parent.findMany({
      where: {
        isActive: true,
        OR: [{ dateOfBirth: { not: null } }, { user: { dateOfBirth: { not: null } } }],
        user: { status: "ACTIVE" },
      },
      select: {
        id: true,
        userId: true,
        dateOfBirth: true,
        user: { select: { id: true, name: true, dateOfBirth: true } },
      },
    });

    for (const par of parents) {
      const effectiveDob = par.dateOfBirth || par.user?.dateOfBirth;
      const isToday = isBirthdayToday(effectiveDob, targetDateRef);
      const pastCheck = !isToday && includeCatchUp ? isBirthdayInPastDays(effectiveDob, 2) : null;

      if (isToday || pastCheck) {
        celebrants.push({
          personType: "parent",
          personId: par.id,
          name: par.user?.name || "Parent",
          isLate: Boolean(pastCheck),
          recipients: [{ userId: par.userId, audience: "PARENT_SELF" }],
        });
      }
    }
  }

  // F. BUS DRIVERS (Fleet)
  const drivers = await prisma.bus.findMany({
    where: {
      isActive: true,
      driverDob: { not: null },
    },
    select: { id: true, busNumber: true, driverName: true, driverDob: true },
  });

  for (const drv of drivers) {
    const isToday = isBirthdayToday(drv.driverDob, targetDateRef);
    if (isToday) {
      celebrants.push({
        personType: "driver",
        personId: drv.id,
        name: `${drv.driverName} (Bus ${drv.busNumber})`,
        isLate: false,
        recipients: [], // No portal account
      });
    }
  }

  // 3. Dispatch wishes with batching & idempotency
  let sentCount = 0;
  let skippedAlreadySent = 0;
  let skippedNoAccount = 0;
  let failedCount = 0;
  let lateWishesSent = 0;

  const CHUNK_SIZE = 25;
  for (let i = 0; i < celebrants.length; i += CHUNK_SIZE) {
    const chunk = celebrants.slice(i, i + CHUNK_SIZE);

    for (const celebrant of chunk) {
      // Drivers have no portal accounts -> record idempotency entry as SKIPPED_NO_ACCOUNT
      if (celebrant.recipients.length === 0) {
        try {
          await prisma.birthdayWish.create({
            data: {
              audience: "DRIVER" as any,
              personType: celebrant.personType,
              personId: celebrant.personId,
              studentId: celebrant.personType === "student" ? celebrant.personId : null,
              year,
              status: "SKIPPED_NO_ACCOUNT",
            },
          });
          skippedNoAccount++;
        } catch {
          skippedAlreadySent++;
        }
        continue;
      }

      for (const recipient of celebrant.recipients) {
        // Idempotency Check: BirthdayWishLog unique(userId, year) AND BirthdayWish
        const [existingLog, existingWish] = await Promise.all([
          prisma.birthdayWishLog.findUnique({
            where: {
              userId_year: {
                userId: recipient.userId,
                year,
              },
            },
          }),
          prisma.birthdayWish.findFirst({
            where: {
              audience: recipient.audience,
              personType: celebrant.personType,
              personId: celebrant.personId,
              recipientUserId: recipient.userId,
              year,
            },
          }),
        ]);

        if (existingLog || existingWish) {
          skippedAlreadySent++;
          continue;
        }

        // Build tailored card payload
        const dashboardLink =
          recipient.audience === "PARENT_OF_STUDENT" || recipient.audience === "PARENT_SELF"
            ? "/dashboard/parent"
            : recipient.audience === "TEACHER"
            ? "/dashboard/teacher"
            : recipient.audience === "STAFF"
            ? "/dashboard/staff"
            : recipient.audience === "ADMIN"
            ? "/dashboard/admin"
            : "/dashboard/student";

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
        const latePrefix = celebrant.isLate ? "[Late Birthday Wishes] " : "";
        const titleText = `${latePrefix}Happy Birthday, ${celebrant.name}! 🎂`;

        try {
          // Universal Notification Dispatch (In-App + Web/iOS Push + Android FCM)
          const notifResult = await sendUniversalNotification({
            userId: recipient.userId,
            title: titleText,
            body: cardPayload.summaryText,
            content: notificationContent,
            category: "BIRTHDAY",
            url: dashboardLink,
            tag: `birthday-${recipient.userId}-${year}`,
            priority: "NORMAL",
          });

          // Record in BirthdayWishLog for strict (userId, year) idempotency
          await prisma.birthdayWishLog.create({
            data: {
              userId: recipient.userId,
              year,
              status: celebrant.isLate ? "SENT_LATE" : "SENT",
              isLate: Boolean(celebrant.isLate),
            },
          });

          // Record in BirthdayWish for rich auditing
          await prisma.birthdayWish.create({
            data: {
              audience: recipient.audience,
              personType: celebrant.personType,
              personId: celebrant.personId,
              studentId: celebrant.personType === "student" ? celebrant.personId : null,
              recipientUserId: recipient.userId,
              year,
              notificationId: notifResult.notificationId || null,
              status: celebrant.isLate ? "SENT_LATE" : "SENT",
            },
          });

          sentCount++;
          if (celebrant.isLate) lateWishesSent++;
        } catch (err: any) {
          failedCount++;
          console.error(`[Birthdays] Failed to dispatch wish to ${recipient.userId}:`, err?.message);
        }
      }
    }
  }

  // 4. Class Teacher Digest (Optional feature toggle)
  if (settings.notifyClassTeacher) {
    const studentCelebrants = celebrants.filter((c) => c.personType === "student" && c.classId);
    const classGroups = new Map<string, string[]>();

    for (const sc of studentCelebrants) {
      if (sc.classId) {
        const list = classGroups.get(sc.classId) || [];
        list.push(sc.name);
        classGroups.set(sc.classId, list);
      }
    }

    for (const [classId, names] of classGroups.entries()) {
      try {
        const clsRecord = await prisma.class.findUnique({
          where: { id: classId },
          select: {
            name: true,
            section: true,
            classTeacher: {
              select: {
                id: true,
                user: { select: { id: true, name: true, status: true } },
              },
            },
          },
        });

        const teacherUser = clsRecord?.classTeacher?.user;
        if (teacherUser && teacherUser.status === "ACTIVE") {
          const classNameFormatted = formatClassName(clsRecord.name, clsRecord.section);
          const digestTitle = `Birthdays today in ${classNameFormatted} 🎂`;
          const digestBody = `${names.join(", ")} ${names.length === 1 ? "has a birthday" : "have birthdays"} today. SRT School has sent wishes. You can add a personal classroom message.`;

          await sendUniversalNotification({
            userId: teacherUser.id,
            title: digestTitle,
            body: digestBody,
            category: "BIRTHDAY",
            url: "/dashboard/teacher/birthdays",
            tag: `class-teacher-digest-${classId}-${year}`,
            priority: "NORMAL",
          });
        }
      } catch (digestErr) {
        console.warn(`[Birthdays] Class teacher digest error for class ${classId}:`, digestErr);
      }
    }
  }

  const durationMs = Date.now() - startTime;

  // 5. Record Run in BirthdayJobRun table
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
    success: true,
    forDate,
    status: "COMPLETED",
    eligibleCount: celebrants.length,
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
 * Supports students, parents, teachers, staff, and admins.
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

  // Today is their birthday! Check idempotency and send
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

/**
 * GET Handler for Vercel Cron execution.
 * Configured in vercel.json:
 *   "path": "/api/cron/birthdays",
 *   "schedule": "0 19 * * *"  (19:00 UTC = 00:30 IST)
 */
export async function GET(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processUniversalBirthdayWishes(undefined, "vercel-cron", true);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Cron/Birthdays] Execution error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST Handler for manual triggers from admin dashboard or external monitoring.
 */
export async function POST(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await processUniversalBirthdayWishes(
      body.customDate,
      body.triggeredBy || "admin-manual-trigger",
      body.includeCatchUp !== false
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Cron/Birthdays] Manual POST error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
