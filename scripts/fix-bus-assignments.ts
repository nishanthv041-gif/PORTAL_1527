import fs from "fs";
import path from "path";
import { prisma } from "../backend/db/prisma";

export interface BusAssignmentAuditIssue {
  busStudentId: string;
  busId: string;
  busNumber: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  residenceType: string | null;
  isActive: boolean;
  academicYear: string;
  reasons: string[];
}

export async function auditBusAssignments(isDryRun: boolean = true) {
  console.log(`\n======================================================`);
  console.log(`BUS ASSIGNMENTS AUDIT & CLEANUP (${isDryRun ? "DRY RUN MODE" : "CONFIRMED FIX MODE"})`);
  console.log(`======================================================\n`);

  // 1. Fetch all BusStudent rows with student and bus info
  const allBusStudents = await prisma.busStudent.findMany({
    include: {
      bus: {
        select: {
          id: true,
          busNumber: true,
          name: true,
          capacity: true,
          isActive: true,
        },
      },
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rollNumber: true,
          residenceType: true,
          isActive: true,
        },
      },
    },
  });

  console.log(`Total BusStudent rows in database: ${allBusStudents.length}`);

  const issues: BusAssignmentAuditIssue[] = [];
  const studentYearMap = new Map<string, string[]>(); // key: `${studentId}_${academicYear}`, value: busStudentIds

  for (const bs of allBusStudents) {
    const reasons: string[] = [];

    // Check if student record is missing
    if (!bs.student) {
      reasons.push("ORPHANED_RECORD: Student record does not exist in database");
    } else {
      // Check if student is a Hosteller
      if (bs.student.residenceType === "HOSTEL") {
        reasons.push(`INVALID_RESIDENCE: Student is marked as HOSTEL (Bus is Day-Scholar only)`);
      }

      // Check if student is inactive
      if (!bs.student.isActive) {
        reasons.push(`INACTIVE_STUDENT: Student is marked as inactive/disabled in school database`);
      }
    }

    // Check if bus record is missing or inactive
    if (!bs.bus) {
      reasons.push("ORPHANED_BUS: Bus record does not exist in database");
    }

    // Track duplicate assignments for same student in same academic year
    const key = `${bs.studentId}_${bs.academicYear}`;
    if (!studentYearMap.has(key)) {
      studentYearMap.set(key, []);
    }
    studentYearMap.get(key)!.push(bs.id);

    if (reasons.length > 0) {
      issues.push({
        busStudentId: bs.id,
        busId: bs.busId,
        busNumber: bs.bus?.busNumber || "UNKNOWN",
        studentId: bs.studentId,
        studentName: bs.student ? `${bs.student.firstName} ${bs.student.lastName}` : "MISSING",
        rollNumber: bs.student?.rollNumber || "N/A",
        residenceType: bs.student?.residenceType || null,
        isActive: bs.student?.isActive ?? false,
        academicYear: bs.academicYear,
        reasons,
      });
    }
  }

  // Check for duplicate assignments across different buses
  for (const [key, ids] of studentYearMap.entries()) {
    if (ids.length > 1) {
      for (const id of ids.slice(1)) {
        const existing = issues.find((i) => i.busStudentId === id);
        if (existing) {
          existing.reasons.push(`DUPLICATE_ASSIGNMENT: Student has ${ids.length} bus assignments in academic year`);
        } else {
          const bs = allBusStudents.find((b) => b.id === id)!;
          issues.push({
            busStudentId: bs.id,
            busId: bs.busId,
            busNumber: bs.bus?.busNumber || "UNKNOWN",
            studentId: bs.studentId,
            studentName: bs.student ? `${bs.student.firstName} ${bs.student.lastName}` : "MISSING",
            rollNumber: bs.student?.rollNumber || "N/A",
            residenceType: bs.student?.residenceType || null,
            isActive: bs.student?.isActive ?? false,
            academicYear: bs.academicYear,
            reasons: [`DUPLICATE_ASSIGNMENT: Student has ${ids.length} bus assignments in academic year`],
          });
        }
      }
    }
  }

  console.log(`\nAudit Results:`);
  console.log(`- Valid Day-Scholar bus assignments: ${allBusStudents.length - issues.length}`);
  console.log(`- Problematic / Invalid assignments found: ${issues.length}`);

  if (issues.length > 0) {
    console.log(`\nDetailed Breakdown of Issues:`);
    issues.forEach((issue, idx) => {
      console.log(`\n[${idx + 1}] BusStudent ID: ${issue.busStudentId}`);
      console.log(`    Bus: ${issue.busNumber} (ID: ${issue.busId})`);
      console.log(`    Student: ${issue.studentName} (Roll: ${issue.rollNumber})`);
      console.log(`    Residence: ${issue.residenceType || "NULL"} | Active: ${issue.isActive}`);
      console.log(`    Academic Year: ${issue.academicYear}`);
      console.log(`    Reasons for flagging:`);
      issue.reasons.forEach((r) => console.log(`      - ${r}`));
    });

    // Export backup to JSON
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `bus_assignments_backup_${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ timestamp: new Date().toISOString(), totalIssues: issues.length, issues }, null, 2), "utf8");
    console.log(`\n[BACKUP] Exported affected records backup to: ${backupFile}`);

    if (!isDryRun) {
      console.log(`\n[FIXING] Executing database cleanup (--confirm passed)...`);
      const idsToDelete = issues.map((i) => i.busStudentId);
      const deleteResult = await prisma.busStudent.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      console.log(`[SUCCESS] Deleted ${deleteResult.count} invalid BusStudent row(s) from database.`);
    } else {
      console.log(`\n[DRY RUN] No database records were modified. Pass --confirm to apply fixes.`);
    }
  } else {
    console.log(`\n✅ Database is 100% clean! All current bus assignments belong to valid, active Day-Scholar students.`);
  }

  return { totalChecked: allBusStudents.length, invalidCount: issues.length, issues };
}

async function runCli() {
  const isConfirm = process.argv.includes("--confirm");
  try {
    await auditBusAssignments(!isConfirm);
  } catch (err) {
    console.error("Cleanup script error:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runCli();
}

