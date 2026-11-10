import path from "path";
import fs from "fs";

// Load environment variables using native Node.js process.loadEnvFile
const envLocal = path.resolve(process.cwd(), ".env.local");
const envMain = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envLocal)) {
  try { (process as any).loadEnvFile(envLocal); } catch {}
} else if (fs.existsSync(envMain)) {
  try { (process as any).loadEnvFile(envMain); } catch {}
}

import { prisma } from "../backend/db/prisma";
import { getSchoolNow } from "../lib/time";
import { Prisma } from "@prisma/client";

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

async function runDryRun() {
  console.log("==================================================");
  console.log("SRT SCHOOL - UNIVERSAL BIRTHDAY ENGINE (DRY RUN)");
  console.log("==================================================");

  // Parse optional --date=YYYY-MM-DD argument
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const schoolNow = getSchoolNow();

  let year = schoolNow.year;
  let month = schoolNow.month;
  let day = schoolNow.day;

  if (dateArg) {
    const val = dateArg.split("=")[1];
    const parts = val.split("-");
    if (parts.length === 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
      console.log(`Using custom evaluation date: ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  } else {
    console.log(`Using today's school date (Asia/Kolkata): ${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  const isFeb28InNonLeapYear = !isLeapYear(year) && month === 2 && day === 28;

  // 1. Fetch BirthdaySettings
  const settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  console.log(`\nSystem Settings:`);
  console.log(`- Master Switch: ${settings?.enabled ? "ENABLED" : "DISABLED"}`);
  console.log(`- Language: ${settings?.language || "EN"}`);
  console.log(`- Send Time: ${settings?.sendTimeLocal || "07:00"} (IST)`);
  console.log(`- Audiences: Students(${settings?.notifyStudents}), ParentsOfStudents(${settings?.notifyParents}), Teachers(${settings?.notifyTeachers}), Staff(${settings?.notifyStaff}), Admins(${settings?.notifyAdmins})`);

  // 2. Query celebrants
  console.log(`\nScanning Database for Celebrants born on Month=${month}, Day=${day}...`);

  const [students, teachers, staff, admins, parents, drivers] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s."id" FROM "Student" s
      WHERE s."isActive" = true AND s."dateOfBirth" IS NOT NULL
        AND ((EXTRACT(MONTH FROM s."dateOfBirth") = ${month} AND EXTRACT(DAY FROM s."dateOfBirth") = ${day})
             ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM s."dateOfBirth") = 2 AND EXTRACT(DAY FROM s."dateOfBirth") = 29)` : Prisma.empty});
    `,
    prisma.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT t."id", t."userId" FROM "Teacher" t
      JOIN "User" u ON t."userId" = u."id"
      WHERE t."isActive" = true AND u."status" = 'ACTIVE'
        AND COALESCE(t."dateOfBirth", u."dateOfBirth") IS NOT NULL
        AND ((EXTRACT(MONTH FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = ${month} AND EXTRACT(DAY FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = ${day})
             ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = 2 AND EXTRACT(DAY FROM COALESCE(t."dateOfBirth", u."dateOfBirth")) = 29)` : Prisma.empty});
    `,
    prisma.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT st."id", st."userId" FROM "Staff" st
      JOIN "User" u ON st."userId" = u."id"
      WHERE st."isActive" = true AND u."status" = 'ACTIVE'
        AND COALESCE(st."dateOfBirth", u."dateOfBirth") IS NOT NULL
        AND ((EXTRACT(MONTH FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = ${month} AND EXTRACT(DAY FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = ${day})
             ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = 2 AND EXTRACT(DAY FROM COALESCE(st."dateOfBirth", u."dateOfBirth")) = 29)` : Prisma.empty});
    `,
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT u."id" FROM "User" u
      WHERE u."role" = 'ADMIN' AND u."status" = 'ACTIVE'
        AND u."dateOfBirth" IS NOT NULL
        AND ((EXTRACT(MONTH FROM u."dateOfBirth") = ${month} AND EXTRACT(DAY FROM u."dateOfBirth") = ${day})
             ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM u."dateOfBirth") = 2 AND EXTRACT(DAY FROM u."dateOfBirth") = 29)` : Prisma.empty});
    `,
    prisma.$queryRaw<Array<{ id: string; userId: string }>>`
      SELECT p."id", p."userId" FROM "Parent" p
      JOIN "User" u ON p."userId" = u."id"
      WHERE p."isActive" = true AND u."status" = 'ACTIVE'
        AND COALESCE(p."dateOfBirth", u."dateOfBirth") IS NOT NULL
        AND ((EXTRACT(MONTH FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = ${month} AND EXTRACT(DAY FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = ${day})
             ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = 2 AND EXTRACT(DAY FROM COALESCE(p."dateOfBirth", u."dateOfBirth")) = 29)` : Prisma.empty});
    `,
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT b."id" FROM "Bus" b
      WHERE b."isActive" = true AND b."driverDob" IS NOT NULL
        AND ((EXTRACT(MONTH FROM b."driverDob") = ${month} AND EXTRACT(DAY FROM b."driverDob") = ${day})
             ${isFeb28InNonLeapYear ? Prisma.sql`OR (EXTRACT(MONTH FROM b."driverDob") = 2 AND EXTRACT(DAY FROM b."driverDob") = 29)` : Prisma.empty});
    `,
  ]);

  const totalEligible = students.length + teachers.length + staff.length + admins.length + parents.length + drivers.length;

  console.log(`\nCelebrants Found:`);
  console.log(`- Students: ${students.length}`);
  console.log(`- Teachers: ${teachers.length}`);
  console.log(`- Staff: ${staff.length}`);
  console.log(`- Admins: ${admins.length}`);
  console.log(`- Parents: ${parents.length}`);
  console.log(`- Bus Drivers (Fleet): ${drivers.length}`);
  console.log(`- TOTAL ELIGIBLE: ${totalEligible}`);

  // 3. Check already sent wishes for these celebrants in year
  const existingWishes = await prisma.birthdayWish.findMany({
    where: { year },
    select: { personId: true, audience: true, status: true },
  });

  console.log(`\nIdempotency Audit for Year ${year}:`);
  console.log(`- Existing recorded wishes in DB: ${existingWishes.length}`);

  console.log("\n==================================================");
  console.log("DRY RUN COMPLETE (No actual notifications sent)");
  console.log("==================================================");
}

runDryRun()
  .catch((e) => {
    console.error("Dry run error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
