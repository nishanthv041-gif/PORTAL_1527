import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/db/prisma";
import { getSchoolNow } from "@/lib/time";
import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { sendUserNotification } from "@/backend/services/push/notificationDispatcher";
import { Prisma } from "@prisma/client";
import { formatClassName } from "@/lib/teacher/formatClassName";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * Constant-time safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates request authorization:
 * Allows AWS EventBridge / Vercel / Render cron with CRON_SECRET, OR authenticated ADMIN session.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronSecret) {
    if (safeCompare(authHeader, cronSecret) || safeCompare(cronHeader, cronSecret)) {
      return true;
    }
  }

  // Fallback: allow logged-in administrators
  try {
    const session = await getCachedServerSession();
    if (session?.user?.role === "ADMIN") {
      return true;
    }
  } catch {
    // Session validation error
  }

  return false;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

interface TargetCelebrant {
  personType: "student" | "teacher" | "staff" | "admin" | "parent" | "driver";
  personId: string;
  name: string;
  className?: string;
  classId?: string;
  recipients: Array<{
    userId: string;
    audience: "STUDENT_SELF" | "PARENT_OF_STUDENT" | "TEACHER" | "STAFF" | "ADMIN" | "PARENT_SELF";
  }>;
}

/**
 * Core engine to dispatch birthday wishes for all roles born on a given calendar date in Asia/Kolkata.
 * Fully idempotent, multi-audience, batched in 25s, logged to BirthdayJobRun.
 */
export async function processUniversalBirthdayWishes(
  customDate?: { year: number; month: number; day: number },
  triggeredBy: string = "scheduler"
) {
  const startTime = Date.now();
  const schoolNow = getSchoolNow();
  const year = customDate?.year ?? schoolNow.year;
  const month = customDate?.month ?? schoolNow.month;
  const day = customDate?.day ?? schoolNow.day;

  const forDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Leap Day rule: In non-leap years, people born on Feb 29 celebrate on Feb 28
  const isFeb28InNonLeapYear = !isLeapYear(year) && month === 2 && day === 28;

  // 1. Fetch Birthday Settings
  let settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.birthdaySettings.create({ data: { id: "default" } });
  }

  // If master switch is disabled, record skipped run and exit
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
      skippedCount: 0,
    };
  }

  // 2. Query all eligible celebrants across roles
  const celebrants: TargetCelebrant[] = [];

  // A. Students
  if (settings.notifyParents || settings.notifyStudents) {
    const students = await prisma.$queryRaw<Array<{
      id: string;
      firstName: string;
      lastName: string | null;
      classId: string | null;
      className: string | null;
      section: string | null;
    }>>`
      SELECT s."id", s."firstName", s."lastName", s."classId", c."name" as "className", c."section"
      FROM "Student" s
      LEFT JOIN "Class" c ON s."classId" = c."id"
      WHERE s."isActive" = true
        AND s."dateOfBirth" IS NOT NULL
        AND (
          (EXTRACT(MONTH FROM s."dateOfBirth") = ${month} AND EXTRACT(DAY FROM s."dateOfBirth") = ${day})
          ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM s."dateOfBirth") = 2 AND EXTRACT(DAY FROM s."dateOfBirth") = 29)` : Prisma.empty}
        );
    `;

    if (students.length > 0) {
      const studentIds = students.map((s) => s.id);
      const parentRelations = await prisma.parentStudent.findMany({
        where: { studentId: { in: studentIds } },
        include: {
          parent: {
            include: {
              user: { select: { id: true, status: true } },
            },
          },
        },
      });

      const parentMap = new Map<string, string[]>();
      for (const rel of parentRelations) {
        if (rel.parent?.user?.id && rel.parent.user.status === "ACTIVE") {
          const list = parentMap.get(rel.studentId) || [];
          list.push(rel.parent.user.id);
          parentMap.set(rel.studentId, list);
        }
      }

      for (const st of students) {
        const studentName = `${st.firstName} ${st.lastName || ""}`.trim();
        const clsName = st.className ? formatClassName(st.className, st.section) : undefined;
        const recipients: TargetCelebrant["recipients"] = [];

        // Parent recipient(s)
        if (settings.notifyParents) {
          const pUserIds = parentMap.get(st.id) || [];
          for (const pUid of pUserIds) {
            recipients.push({ userId: pUid, audience: "PARENT_OF_STUDENT" });
          }
        }

        celebrants.push({
          personType: "student",
          personId: st.id,
          name: studentName,
          className: clsName,
          classId: st.classId || undefined,
          recipients,
        });
      }
    }
  }

  // B. Teachers
  if (settings.notifyTeachers) {
    const teachers = await prisma.$queryRaw<Array<{
      id: string;
      userId: string;
      name: string;
    }>>`
      SELECT t."id", t."userId", u."name"
      FROM "Teacher" t
      JOIN "User" u ON t."userId" = u."id"
      WHERE t."isActive" = true
        AND u."status" = 'ACTIVE'
        AND COALESCE(t."dateOfBirth", u."dateOfBirth") IS NOT NULL
        AND (
          (EXTRACT(MONTH FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = ${month} AND EXTRACT(DAY FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = ${day})
          ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = 2 AND EXTRACT(DAY FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = 29)` : Prisma.empty}
        );
    `;

    for (const t of teachers) {
      celebrants.push({
        personType: "teacher",
        personId: t.id,
        name: t.name,
        recipients: [{ userId: t.userId, audience: "TEACHER" }],
      });
    }
  }

  // C. Staff
  if (settings.notifyStaff) {
    const staffMembers = await prisma.$queryRaw<Array<{
      id: string;
      userId: string;
      name: string;
    }>>`
      SELECT st."id", st."userId", u."name"
      FROM "Staff" st
      JOIN "User" u ON st."userId" = u."id"
      WHERE st."isActive" = true
        AND u."status" = 'ACTIVE'
        AND COALESCE(st."dateOfBirth", u."dateOfBirth") IS NOT NULL
        AND (
          (EXTRACT(MONTH FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = ${month} AND EXTRACT(DAY FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = ${day})
          ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = 2 AND EXTRACT(DAY FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = 29)` : Prisma.empty}
        );
    `;

    for (const st of staffMembers) {
      celebrants.push({
        personType: "staff",
        personId: st.id,
        name: st.name,
        recipients: [{ userId: st.userId, audience: "STAFF" }],
      });
    }
  }

  // D. Admins
  if (settings.notifyAdmins) {
    const admins = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
    }>>`
      SELECT u."id", u."name"
      FROM "User" u
      WHERE u."role" = 'ADMIN'
        AND u."status" = 'ACTIVE'
        AND u."dateOfBirth" IS NOT NULL
        AND (
          (EXTRACT(MONTH FROM u."dateOfBirth") = ${month} AND EXTRACT(DAY FROM u."dateOfBirth") = ${day})
          ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM u."dateOfBirth") = 2 AND EXTRACT(DAY FROM u."dateOfBirth") = 29)` : Prisma.empty}
        );
    `;

    for (const adm of admins) {
      celebrants.push({
        personType: "admin",
        personId: adm.id,
        name: adm.name,
        recipients: [{ userId: adm.id, audience: "ADMIN" }],
      });
    }
  }

  // E. Parents (Own Birthday)
  if (settings.notifyParents) {
    const parents = await prisma.$queryRaw<Array<{
      id: string;
      userId: string;
      name: string;
    }>>`
      SELECT p."id", p."userId", u."name"
      FROM "Parent" p
      JOIN "User" u ON p."userId" = u."id"
      WHERE p."isActive" = true
        AND u."status" = 'ACTIVE'
        AND COALESCE(p."dateOfBirth", u."dateOfBirth") IS NOT NULL
        AND (
          (EXTRACT(MONTH FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = ${month} AND EXTRACT(DAY FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = ${day})
          ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = 2 AND EXTRACT(DAY FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = 29)` : Prisma.empty}
        );
    `;

    for (const par of parents) {
      celebrants.push({
        personType: "parent",
        personId: par.id,
        name: par.name,
        recipients: [{ userId: par.userId, audience: "PARENT_SELF" }],
      });
    }
  }

  // F. Bus Drivers (Fleet)
  const drivers = await prisma.$queryRaw<Array<{
    id: string;
    busNumber: string;
    driverName: string;
  }>>`
    SELECT b."id", b."busNumber", b."driverName"
    FROM "Bus" b
    WHERE b."isActive" = true
      AND b."driverDob" IS NOT NULL
      AND (
        (EXTRACT(MONTH FROM b."driverDob") = ${month} AND EXTRACT(DAY FROM b."driverDob") = ${day})
        ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM b."driverDob") = 2 AND EXTRACT(DAY FROM b."driverDob") = 29)` : Prisma.empty}
      );
  `;

  for (const drv of drivers) {
    celebrants.push({
      personType: "driver",
      personId: drv.id,
      name: `${drv.driverName} (Bus ${drv.busNumber})`,
      recipients: [], // No portal account
    });
  }

  // 3. Dispatch wishes with batching (25/chunk)
  let sentCount = 0;
  let skippedAlreadySent = 0;
  let skippedNoAccount = 0;
  let failedCount = 0;

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
        // Check if wish already sent for this recipient this year
        const existing = await prisma.birthdayWish.findFirst({
          where: {
            audience: recipient.audience,
            personType: celebrant.personType,
            personId: celebrant.personId,
            recipientUserId: recipient.userId,
            year,
          },
        });

        if (existing) {
          skippedAlreadySent++;
          continue;
        }

        // Prepare message content based on audience and language
        let title = `Happy Birthday, ${celebrant.name}! 🎂`;
        let message = "";
        const lang = settings.language || "EN";

        if (recipient.audience === "PARENT_OF_STUDENT") {
          title = `Happy Birthday, ${celebrant.name}! 🎂`;
          const baseEn =
            settings.parentTemplateEn ||
            "Dear Parent, SRT School wishes {studentName} a very happy birthday! May this year bring happiness, good health, and abundant success. - SRT Universal School";
          const baseTa =
            settings.parentTemplateTa ||
            "அன்புள்ள பெற்றோருக்கு, {studentName}-க்கு SRT பள்ளி பிறந்தநாள் நல்வாழ்த்துகளைத் தெரிவித்துக் கொள்கிறது! - SRT Universal School";

          const renderedEn = baseEn
            .replace(/{studentName}/g, celebrant.name)
            .replace(/{name}/g, celebrant.name)
            .replace(/{className}/g, celebrant.className || "");
          const renderedTa = baseTa
            .replace(/{studentName}/g, celebrant.name)
            .replace(/{name}/g, celebrant.name)
            .replace(/{className}/g, celebrant.className || "");

          if (lang === "TA") message = renderedTa;
          else if (lang === "BOTH") message = `${renderedEn}\n\n${renderedTa}`;
          else message = renderedEn;
        } else if (recipient.audience === "TEACHER") {
          const baseEn =
            settings.teacherTemplateEn ||
            "Dear {name}, SRT School wishes you a very Happy Birthday! Thank you for your dedication and wonderful service to our students. Have a fantastic year ahead! - SRT Universal School";
          const baseTa =
            settings.teacherTemplateTa ||
            "வணக்கம் {name}, SRT பள்ளி தங்களுக்கு மனமார்ந்த பிறந்தநாள் நல்வாழ்த்துகளைத் தெரிவித்துக் கொள்கிறது! - SRT Universal School";

          const renderedEn = baseEn.replace(/{name}/g, celebrant.name);
          const renderedTa = baseTa.replace(/{name}/g, celebrant.name);

          if (lang === "TA") message = renderedTa;
          else if (lang === "BOTH") message = `${renderedEn}\n\n${renderedTa}`;
          else message = renderedEn;
        } else if (recipient.audience === "STAFF") {
          const baseEn =
            settings.staffTemplateEn ||
            "Dear {name}, SRT School wishes you a very Happy Birthday! Thank you for your valuable support and contribution. - SRT Universal School";
          message = baseEn.replace(/{name}/g, celebrant.name);
        } else if (recipient.audience === "ADMIN") {
          const baseEn =
            settings.adminTemplateEn ||
            "Dear {name}, SRT School wishes you a very Happy Birthday! Thank you for your leadership and guidance. - SRT Universal School";
          message = baseEn.replace(/{name}/g, celebrant.name);
        } else if (recipient.audience === "PARENT_SELF") {
          message = `Dear ${celebrant.name}, SRT School wishes you a very Happy Birthday! May you and your family have a wonderful year ahead! - SRT Universal School`;
        } else {
          message = `Happy Birthday, ${celebrant.name}! 🎂 SRT School wishes you a wonderful birthday full of joy and great learning!`;
        }

        try {
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

          // Create in-app notification
          const notif = await prisma.notification.create({
            data: {
              userId: recipient.userId,
              title,
              content: message,
              type: "ANNOUNCEMENT",
              category: "GENERAL",
              priority: "NORMAL",
              link: dashboardLink,
              isRead: false,
            },
          });

          // Dispatch web push / native notification asynchronously
          sendUserNotification(
            recipient.userId,
            title,
            message,
            "academic",
            dashboardLink,
            "NORMAL"
          ).catch(() => {});

          // Record in BirthdayWish table
          await prisma.birthdayWish.create({
            data: {
              audience: recipient.audience,
              personType: celebrant.personType,
              personId: celebrant.personId,
              studentId: celebrant.personType === "student" ? celebrant.personId : null,
              recipientUserId: recipient.userId,
              year,
              notificationId: notif.id,
              status: "SENT",
            },
          });

          sentCount++;
        } catch (err: any) {
          failedCount++;
          console.error("Failed to send birthday wish:", err?.message);
        }
      }
    }
  }

  // 3b. Dispatch Class Teacher Digests (grouped by classId)
  if (settings.notifyClassTeacher) {
    const classCelebrantMap = new Map<string, { className: string; students: string[] }>();
    for (const c of celebrants) {
      if (c.personType === "student" && c.classId) {
        const item = classCelebrantMap.get(c.classId) || { className: c.className || "Class", students: [] };
        item.students.push(c.name);
        classCelebrantMap.set(c.classId, item);
      }
    }

    for (const [clsId, info] of classCelebrantMap.entries()) {
      try {
        const clsRecord = await prisma.class.findUnique({
          where: { id: clsId },
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
        if (!teacherUser || teacherUser.status !== "ACTIVE") {
          continue;
        }

        // Check if class teacher digest was already sent for this class and year
        const existingDigest = await prisma.birthdayWish.findFirst({
          where: {
            audience: "CLASS_TEACHER_DIGEST",
            personType: "class",
            personId: clsId,
            recipientUserId: teacherUser.id,
            year,
          },
        });

        if (existingDigest) {
          continue;
        }

        const classDisplayName = formatClassName(clsRecord.name, clsRecord.section);
        const namesList =
          info.students.length === 1
            ? info.students[0]
            : info.students.length === 2
            ? `${info.students[0]} and ${info.students[1]}`
            : `${info.students.slice(0, -1).join(", ")} and ${info.students[info.students.length - 1]}`;

        const verb = info.students.length === 1 ? "has a birthday" : "have birthdays";
        const digestTitle = `Birthdays today in ${classDisplayName} 🎂`;
        const digestBody = `${namesList} ${verb} today. SRT School has sent their wishes. You can add a personal message.`;

        const notif = await prisma.notification.create({
          data: {
            userId: teacherUser.id,
            title: digestTitle,
            content: digestBody,
            type: "ANNOUNCEMENT",
            category: "GENERAL",
            priority: "HIGH",
            link: "/dashboard/teacher/birthdays",
            isRead: false,
          },
        });

        sendUserNotification(
          teacherUser.id,
          digestTitle,
          digestBody,
          "academic",
          "/dashboard/teacher/birthdays",
          "URGENT"
        ).catch(() => {});

        await prisma.birthdayWish.create({
          data: {
            audience: "CLASS_TEACHER_DIGEST",
            personType: "class",
            personId: clsId,
            recipientUserId: teacherUser.id,
            year,
            notificationId: notif.id,
            status: "SENT",
          },
        });
      } catch (err: any) {
        console.error(`Failed to send class teacher digest for class ${clsId}:`, err?.message);
      }
    }
  }

  // 4. Record Run in BirthdayJobRun
  await prisma.birthdayJobRun.create({
    data: {
      forDate,
      sentCount,
      skippedAlreadySent,
      skippedNoAccount,
      failedCount,
      durationMs: Date.now() - startTime,
      triggeredBy,
    },
  }).catch(() => {});

  return {
    success: failedCount === 0,
    forDate,
    eligibleCount: celebrants.length,
    sentCount,
    skippedAlreadySent,
    skippedNoAccount,
    failedCount,
  };
}

/**
 * Checks if yesterday's scheduled birthday run was completed; if not, catches it up once.
 */
async function checkAndRepairMissedRun() {
  const schoolNow = getSchoolNow();
  // Yesterday in school timezone
  const yesterdayDate = new Date(Date.UTC(schoolNow.year, schoolNow.month - 1, schoolNow.day - 1));
  const yYear = yesterdayDate.getUTCFullYear();
  const yMonth = yesterdayDate.getUTCMonth() + 1;
  const yDay = yesterdayDate.getUTCDate();
  const yForDate = `${yYear}-${String(yMonth).padStart(2, "0")}-${String(yDay).padStart(2, "0")}`;

  const yesterdayRun = await prisma.birthdayJobRun.findFirst({
    where: { forDate: yForDate },
  });

  if (!yesterdayRun) {
    // Yesterday was missed! Run catch-up for yesterday
    await processUniversalBirthdayWishes({ year: yYear, month: yMonth, day: yDay }, "repair").catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing secret." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customDate = body?.customDate; // Allow testing with custom date in admin dry-run

    if (!customDate) {
      await checkAndRepairMissedRun().catch(() => {});
    }

    const result = await processUniversalBirthdayWishes(customDate, customDate ? "manual" : "scheduler");
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Universal birthday engine execution error:", error?.message);
    return NextResponse.json({ error: "Failed to process birthday wishes" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized: Invalid or missing secret." }, { status: 401 });
  }

  try {
    await checkAndRepairMissedRun().catch(() => {});
    const result = await processUniversalBirthdayWishes();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Universal birthday engine execution error:", error?.message);
    return NextResponse.json({ error: "Failed to process birthday wishes" }, { status: 500 });
  }
}

/**
 * Immediate birthday trigger:
 * When a DOB is saved or updated and matches today in Asia/Kolkata,
 * immediately dispatches wishes to the celebrant and parents, and creates/updates the class teacher digest!
 */
export async function dispatchImmediateBirthdayWishForPerson(params: {
  personType: string;
  personId: string;
  classId?: string;
  forceSend?: boolean;
}): Promise<{ success: boolean; sentCount: number; isBirthdayToday: boolean; message: string }> {
  const schoolNow = getSchoolNow();
  const year = schoolNow.year;
  const month = schoolNow.month;
  const day = schoolNow.day;
  const isFeb28InNonLeapYear = !isLeapYear(year) && month === 2 && day === 28;

  let settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.birthdaySettings.create({ data: { id: "default" } });
  }

  if (!settings.enabled) {
    return { success: true, sentCount: 0, isBirthdayToday: false, message: "Birthday system disabled." };
  }

  const pType = params.personType.toLowerCase();

  if (pType === "student") {
    const student = await prisma.student.findUnique({
      where: { id: params.personId },
      include: {
        class: { select: { id: true, name: true, section: true } },
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
      return { success: false, sentCount: 0, isBirthdayToday: false, message: "Student has no Date of Birth." };
    }

    const dobMonth = student.dateOfBirth.getUTCMonth() + 1;
    const dobDay = student.dateOfBirth.getUTCDate();

    const isMatch =
      Boolean(params.forceSend) ||
      (dobMonth === month && dobDay === day) ||
      (isFeb28InNonLeapYear && dobMonth === 2 && dobDay === 29);

    if (!isMatch) {
      return { success: true, sentCount: 0, isBirthdayToday: false, message: "Date saved. Birthday is not today." };
    }

    const studentName = `${student.firstName} ${student.lastName || ""}`.trim();
    const className = student.class ? formatClassName(student.class.name, student.class.section) : "Class";
    let sentCount = 0;

    // 1. Parent wishes
    if (settings.notifyParents) {
      for (const rel of student.parents) {
        const parentUser = rel.parent?.user;
        if (parentUser && parentUser.status === "ACTIVE") {
          const existing = await prisma.birthdayWish.findFirst({
            where: {
              audience: "PARENT_OF_STUDENT",
              personType: "student",
              personId: student.id,
              recipientUserId: parentUser.id,
              year,
            },
          });

          if (!existing || params.forceSend) {
            const title = `Happy Birthday, ${studentName}! 🎂`;
            const baseEn =
              settings.parentTemplateEn ||
              "Dear Parent, SRT School wishes {studentName} a very happy birthday! May this year bring happiness, good health, and abundant success. - SRT Universal School";
            const renderedEn = baseEn.replace(/{studentName}/g, studentName).replace(/{name}/g, studentName);

            const notif = await prisma.notification.create({
              data: {
                userId: parentUser.id,
                title,
                content: renderedEn,
                type: "ANNOUNCEMENT",
                category: "GENERAL",
                priority: "NORMAL",
                link: "/dashboard/parent",
                isRead: false,
              },
            });

            sendUserNotification(parentUser.id, title, renderedEn, "academic", "/dashboard/parent", "NORMAL").catch(() => {});

            if (!existing) {
              await prisma.birthdayWish.create({
                data: {
                  audience: "PARENT_OF_STUDENT",
                  personType: "student",
                  personId: student.id,
                  studentId: student.id,
                  recipientUserId: parentUser.id,
                  year,
                  notificationId: notif.id,
                  status: "SENT",
                },
              });
            }
            sentCount++;
          }
        }
      }
    }

    // 2. Class Teacher notification
    if (settings.notifyClassTeacher && student.classId) {
      const clsRecord = await prisma.class.findUnique({
        where: { id: student.classId },
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
        const existingDigest = await prisma.birthdayWish.findFirst({
          where: {
            audience: "CLASS_TEACHER_DIGEST",
            personType: "class",
            personId: student.classId,
            recipientUserId: teacherUser.id,
            year,
          },
        });

        if (!existingDigest) {
          // Send initial digest
          const digestTitle = `Birthdays today in ${className} 🎂`;
          const digestBody = `${studentName} has a birthday today. SRT School has sent their wishes. You can add a personal message.`;

          const notif = await prisma.notification.create({
            data: {
              userId: teacherUser.id,
              title: digestTitle,
              content: digestBody,
              type: "ANNOUNCEMENT",
              category: "GENERAL",
              priority: "HIGH",
              link: "/dashboard/teacher/birthdays",
              isRead: false,
            },
          });

          sendUserNotification(teacherUser.id, digestTitle, digestBody, "academic", "/dashboard/teacher/birthdays", "URGENT").catch(() => {});

          await prisma.birthdayWish.create({
            data: {
              audience: "CLASS_TEACHER_DIGEST",
              personType: "class",
              personId: student.classId,
              recipientUserId: teacherUser.id,
              year,
              notificationId: notif.id,
              status: "SENT",
            },
          });
          sentCount++;
        } else {
          // Digest already sent earlier today; send follow-up note
          const followUpTitle = `Also today in ${className} 🎂`;
          const followUpBody = `Also celebrating today: ${studentName}. You can add a personal message.`;

          await prisma.notification.create({
            data: {
              userId: teacherUser.id,
              title: followUpTitle,
              content: followUpBody,
              type: "ANNOUNCEMENT",
              category: "GENERAL",
              priority: "NORMAL",
              link: "/dashboard/teacher/birthdays",
              isRead: false,
            },
          });

          sendUserNotification(teacherUser.id, followUpTitle, followUpBody, "academic", "/dashboard/teacher/birthdays", "NORMAL").catch(() => {});
          sentCount++;
        }
      }
    }

    return {
      success: true,
      sentCount,
      isBirthdayToday: true,
      message: `Birthday wish sent to ${studentName} and parents! 🎉`,
    };
  }

  return { success: true, sentCount: 0, isBirthdayToday: false, message: "Date saved successfully." };
}
