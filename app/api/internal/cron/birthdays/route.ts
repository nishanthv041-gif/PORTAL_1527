import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/backend/db/prisma";
import { getSchoolNow } from "@/lib/time";
import { getCachedServerSession } from "@/backend/auth/sessionCache";
import { sendUserNotification } from "@/backend/services/push/notificationDispatcher";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Validates request authorization:
 * Allows Vercel / Render / AWS Cron with secret, OR authenticated ADMIN session.
 */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const cronHeader = req.headers.get("x-cron-secret");

  if (cronSecret && (authHeader === cronSecret || cronHeader === cronSecret)) {
    return true;
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

/**
 * Core engine to dispatch birthday wishes for students born on today's calendar date in Asia/Kolkata.
 * Fully idempotent: checks BirthdayWish table to guarantee at most 1 wish per student per calendar year.
 */
export async function processBirthdayWishes(customDate?: { year: number; month: number; day: number }) {
  const schoolNow = getSchoolNow();
  const year = customDate?.year ?? schoolNow.year;
  const month = customDate?.month ?? schoolNow.month;
  const day = customDate?.day ?? schoolNow.day;

  // Leap Day rule: In non-leap years, students born on Feb 29 celebrate on Feb 28
  const isFeb28InNonLeapYear = !isLeapYear(year) && month === 2 && day === 28;

  // 1. Query students born on this day using SQL extract to avoid UTC shift
  const birthdayStudents = await prisma.$queryRaw<Array<{ id: string; firstName: string; lastName: string | null }>>`
    SELECT s."id", s."firstName", s."lastName"
    FROM "Student" s
    WHERE s."isActive" = true
      AND s."dateOfBirth" IS NOT NULL
      AND (
        (EXTRACT(MONTH FROM s."dateOfBirth") = ${month} AND EXTRACT(DAY FROM s."dateOfBirth") = ${day})
        ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM s."dateOfBirth") = 2 AND EXTRACT(DAY FROM s."dateOfBirth") = 29)` : Prisma.empty}
      );
  `;

  if (!birthdayStudents || birthdayStudents.length === 0) {
    return {
      success: true,
      year,
      month,
      day,
      eligibleCount: 0,
      sentCount: 0,
      skippedAlreadySent: 0,
    };
  }

  const studentIds = birthdayStudents.map((s) => s.id);

  // 2. Idempotency Check: Filter out students who already received a wish this year
  const existingWishes = await prisma.birthdayWish.findMany({
    where: {
      year,
      studentId: { in: studentIds },
    },
    select: { studentId: true },
  });

  const alreadySentSet = new Set(existingWishes.map((w) => w.studentId));
  const pendingStudents = birthdayStudents.filter((s) => !alreadySentSet.has(s.id));

  let sentCount = 0;

  if (pendingStudents.length > 0) {
    const pendingIds = pendingStudents.map((s) => s.id);

    // 3. Fetch linked parents and classes for pending students
    const fullStudentRecords = await prisma.student.findMany({
      where: { id: { in: pendingIds } },
      include: {
        parents: {
          include: {
            parent: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        class: { select: { name: true, section: true } },
      },
    });

    for (const student of fullStudentRecords) {
      const studentFullName = `${student.firstName} ${student.lastName || ""}`.trim();
      const parentUsers = student.parents
        .map((p) => p.parent?.user)
        .filter((u): u is NonNullable<typeof u> => Boolean(u?.id));

      let primaryNotificationId: string | null = null;

      if (parentUsers.length > 0) {
        for (const parentUser of parentUsers) {
          try {
            const notif = await prisma.notification.create({
              data: {
                userId: parentUser.id,
                title: `Happy Birthday, ${student.firstName}! 🎂`,
                content: `Dear Parent, SRT School wishes ${studentFullName} a very happy birthday! May this year bring happiness, good health, and abundant success. - SRT Universal School`,
                type: "ANNOUNCEMENT",
                category: "GENERAL",
                priority: "NORMAL",
                link: "/dashboard/parent",
                isRead: false,
              },
            });

            if (!primaryNotificationId) {
              primaryNotificationId = notif.id;
            }

            // Attempt push notification in background
            sendUserNotification(
              parentUser.id,
              `Happy Birthday, ${student.firstName}! 🎂`,
              `SRT School wishes ${studentFullName} a very happy birthday!`,
              "academic",
              "/dashboard/parent",
              "NORMAL"
            ).catch(() => {});
          } catch (notifErr) {
            console.error("Error creating parent birthday notification:", notifErr);
          }
        }
      }

      // Record in BirthdayWish table for guaranteed idempotency
      try {
        await prisma.birthdayWish.create({
          data: {
            studentId: student.id,
            year,
            notificationId: primaryNotificationId,
            status: parentUsers.length > 0 ? "SENT" : "NO_PARENT",
          },
        });
        sentCount++;
      } catch (wishErr) {
        // Unique constraint violation (studentId, year) means already recorded
        console.warn("BirthdayWish already recorded or conflict:", wishErr);
      }
    }
  }

  return {
    success: true,
    year,
    month,
    day,
    eligibleCount: birthdayStudents.length,
    sentCount,
    skippedAlreadySent: alreadySentSet.size,
  };
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const customDate = body?.customDate; // Allow testing with custom date in dev/admin

    const result = await processBirthdayWishes(customDate);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Birthday cron job execution error:", error?.message);
    return NextResponse.json({ error: "Failed to process birthday wishes" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processBirthdayWishes();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Birthday cron job execution error:", error?.message);
    return NextResponse.json({ error: "Failed to process birthday wishes" }, { status: 500 });
  }
}

