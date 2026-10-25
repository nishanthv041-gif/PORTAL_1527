import { prisma } from "@/backend/db/prisma";

// ==========================================
// ROMAN NUMERAL & GRADE HELPERS
// ==========================================

const ROMAN_TO_INT: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12
};

const INT_TO_ROMAN: Record<number, string> = {
  1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X", 11: "XI", 12: "XII"
};

export interface ParsedGrade {
  prefix: string; // e.g. "Class", "Grade", "Std"
  gradeNumber: number; // 1..12
  isRoman: boolean;
  rawString: string;
}

/**
 * Extracts the grade number from diverse naming formats:
 * - "Class 5", "Class 12", "Grade 10", "Std 1"
 * - "Class V", "Class XII", "Grade X", "Class VI"
 * - "Class 5th", "10th Standard", "5 - A"
 */
export function parseGrade(className: string): ParsedGrade | null {
  if (!className || typeof className !== "string") return null;
  const trimmed = className.trim();

  // Try matching Roman Numerals first (e.g. "Class XII", "Class V", "Grade X")
  const romanMatch = trimmed.match(/^(Class|Grade|Std|Standard)?\s*(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i);
  if (romanMatch) {
    const prefix = (romanMatch[1] || "Class").trim();
    const romanUpper = romanMatch[2].toUpperCase();
    const gradeNumber = ROMAN_TO_INT[romanUpper];
    if (gradeNumber) {
      return {
        prefix: prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase(),
        gradeNumber,
        isRoman: true,
        rawString: trimmed
      };
    }
  }

  // Try matching Numeric representations (e.g. "Class 5", "Class 12", "Grade 10", "Class 10th", "10")
  const numericMatch = trimmed.match(/^(Class|Grade|Std|Standard)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
  if (numericMatch) {
    const prefix = (numericMatch[1] || "Class").trim();
    const gradeNumber = parseInt(numericMatch[2], 10);
    if (!isNaN(gradeNumber) && gradeNumber > 0 && gradeNumber <= 20) {
      return {
        prefix: prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase(),
        gradeNumber,
        isRoman: false,
        rawString: trimmed
      };
    }
  }

  return null;
}

export interface NextClassCalculation {
  currentGradeNumber: number;
  nextGradeNumber: number | null;
  isTerminalClass: boolean; // e.g. Class 12th
  action: "PROMOTE" | "GRADUATE";
  nextClassName: string;
}

/**
 * Calculates the next class name or indicates graduation for Class 12th.
 */
export function calculateNextClass(
  currentClassName: string,
  terminalGrade: number = 12
): NextClassCalculation {
  const parsed = parseGrade(currentClassName);

  // Fallback if name couldn't be parsed
  if (!parsed) {
    return {
      currentGradeNumber: 0,
      nextGradeNumber: null,
      isTerminalClass: false,
      action: "PROMOTE",
      nextClassName: `${currentClassName} (Next Year)`
    };
  }

  // Terminal class (Class 12th) -> Graduated
  if (parsed.gradeNumber >= terminalGrade) {
    return {
      currentGradeNumber: parsed.gradeNumber,
      nextGradeNumber: null,
      isTerminalClass: true,
      action: "GRADUATE",
      nextClassName: "GRADUATED"
    };
  }

  const nextGrade = parsed.gradeNumber + 1;
  const nextFormatted = parsed.isRoman 
    ? (INT_TO_ROMAN[nextGrade] || String(nextGrade))
    : String(nextGrade);

  return {
    currentGradeNumber: parsed.gradeNumber,
    nextGradeNumber: nextGrade,
    isTerminalClass: false,
    action: "PROMOTE",
    nextClassName: `${parsed.prefix} ${nextFormatted}`
  };
}

// ==========================================
// SIMULATION & PREVIEW TYPES
// ==========================================

export interface StudentPromotionPlanItem {
  id: string;
  name: string;
  rollNumber: string;
  admissionNo: string;
  currentClassId: string;
  currentClassName: string;
  currentSection: string;
  defaultAction: "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER";
  chosenAction: "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER";
  targetClassName: string;
  targetSection: string;
}

export interface ClassPromotionMapping {
  sourceClassId: string;
  sourceClassName: string;
  sourceSection: string;
  studentCount: number;
  targetClassName: string;
  targetSection: string;
  isTerminalClass: boolean;
  action: "PROMOTE" | "GRADUATE";
  students: StudentPromotionPlanItem[];
}

export interface PromotionSimulationResult {
  sourceBatch: { id: string; name: string };
  targetBatch: { id: string; name: string };
  totalStudents: number;
  totalToPromote: number;
  totalToGraduate: number;
  classMappings: ClassPromotionMapping[];
  warnings: string[];
}

// ==========================================
// PROMOTION PREVIEW & SIMULATION
// ==========================================

export async function simulateBatchPromotion(
  sourceBatchId: string,
  targetBatchId: string,
  terminalGrade: number = 12
): Promise<PromotionSimulationResult> {
  const [sourceBatch, targetBatch] = await Promise.all([
    prisma.academicBatch.findUnique({
      where: { id: sourceBatchId },
      include: {
        classes: {
          where: { isActive: true },
          include: {
            students: {
              where: { isActive: true, enrollmentStatus: { not: "GRADUATED" } },
              orderBy: [{ rollNumber: "asc" }, { firstName: "asc" }]
            }
          },
          orderBy: [{ name: "asc" }, { section: "asc" }]
        }
      }
    }),
    prisma.academicBatch.findUnique({
      where: { id: targetBatchId }
    })
  ]);

  if (!sourceBatch) {
    throw new Error(`Source batch with ID '${sourceBatchId}' not found.`);
  }

  if (!targetBatch) {
    throw new Error(`Target batch with ID '${targetBatchId}' not found.`);
  }

  let sourceClasses = sourceBatch.classes;

  // Fallback: If source batch has no linked classes yet, inspect active classes without a batch
  if (sourceClasses.length === 0) {
    sourceClasses = await prisma.class.findMany({
      where: { isActive: true },
      include: {
        students: {
          where: { isActive: true, enrollmentStatus: { not: "GRADUATED" } },
          orderBy: [{ rollNumber: "asc" }, { firstName: "asc" }]
        }
      },
      orderBy: [{ name: "asc" }, { section: "asc" }]
    });
  }

  const classMappings: ClassPromotionMapping[] = [];
  let totalStudents = 0;
  let totalToPromote = 0;
  let totalToGraduate = 0;
  const warnings: string[] = [];

  for (const cls of sourceClasses) {
    const nextCalc = calculateNextClass(cls.name, terminalGrade);
    const isTerminal = nextCalc.isTerminalClass;
    const action = nextCalc.action;

    const studentItems: StudentPromotionPlanItem[] = cls.students.map(s => {
      const defaultAct = isTerminal ? "GRADUATE" : "PROMOTE";
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        currentClassId: cls.id,
        currentClassName: cls.name,
        currentSection: cls.section,
        defaultAction: defaultAct,
        chosenAction: defaultAct,
        targetClassName: isTerminal ? "ALUMNI / GRADUATED" : nextCalc.nextClassName,
        targetSection: cls.section
      };
    });

    totalStudents += cls.students.length;
    if (isTerminal) {
      totalToGraduate += cls.students.length;
    } else {
      totalToPromote += cls.students.length;
    }

    classMappings.push({
      sourceClassId: cls.id,
      sourceClassName: cls.name,
      sourceSection: cls.section,
      studentCount: cls.students.length,
      targetClassName: isTerminal ? "ALUMNI / GRADUATED" : nextCalc.nextClassName,
      targetSection: cls.section,
      isTerminalClass: isTerminal,
      action,
      students: studentItems
    });
  }

  if (sourceClasses.length === 0) {
    warnings.push("No active classes found under source batch. Please ensure classes exist before promoting.");
  }

  return {
    sourceBatch: { id: sourceBatch.id, name: sourceBatch.name },
    targetBatch: { id: targetBatch.id, name: targetBatch.name },
    totalStudents,
    totalToPromote,
    totalToGraduate,
    classMappings,
    warnings
  };
}

// ==========================================
// ATOMIC PROMOTION EXECUTION
// ==========================================

export interface ExecutePromotionInput {
  sourceBatchId: string;
  targetBatchId: string;
  studentOverrides?: Record<string, "PROMOTE" | "GRADUATE" | "RETAIN" | "TRANSFER">;
  authorizedById?: string;
  terminalGrade?: number;
}

export interface ExecutePromotionResult {
  success: boolean;
  sourceBatchName: string;
  targetBatchName: string;
  promotedCount: number;
  graduatedCount: number;
  retainedCount: number;
  transferredCount: number;
  classesCreatedCount: number;
  error?: string;
}

export async function executeBatchPromotionTransaction(
  input: ExecutePromotionInput
): Promise<ExecutePromotionResult> {
  const terminalGrade = input.terminalGrade || 12;

  // Run simulation to build canonical mapping
  const simulation = await simulateBatchPromotion(input.sourceBatchId, input.targetBatchId, terminalGrade);

  const overrides = input.studentOverrides || {};

  return await prisma.$transaction(async (tx) => {
    let promotedCount = 0;
    let graduatedCount = 0;
    let retainedCount = 0;
    let transferredCount = 0;
    let classesCreatedCount = 0;

    // Cache existing target classes for quick lookup: "ClassName - Section" -> Class
    const existingTargetClasses = await tx.class.findMany({
      where: {
        OR: [
          { batchId: input.targetBatchId },
          { isActive: true }
        ]
      }
    });

    const targetClassMap = new Map<string, typeof existingTargetClasses[0]>();
    for (const c of existingTargetClasses) {
      targetClassMap.set(`${c.name.toLowerCase()}||${c.section.toLowerCase()}`, c);
    }

    // Helper: Find or create target class
    async function getOrCreateTargetClass(name: string, section: string, maxStrength: number = 40) {
      const key = `${name.toLowerCase()}||${section.toLowerCase()}`;
      if (targetClassMap.has(key)) {
        const existing = targetClassMap.get(key)!;
        if (existing.batchId !== input.targetBatchId) {
          await tx.class.update({
            where: { id: existing.id },
            data: { batchId: input.targetBatchId }
          });
          existing.batchId = input.targetBatchId;
        }
        return existing;
      }

      const created = await tx.class.create({
        data: {
          name,
          section,
          maxStrength,
          isActive: true,
          batchId: input.targetBatchId
        }
      });

      targetClassMap.set(key, created);
      classesCreatedCount++;
      return created;
    }

    // Ensure Class 1 exists in the target batch for incoming new admissions
    await getOrCreateTargetClass("Class 1", "A");

    // Process all classes and their students
    for (const mapping of simulation.classMappings) {
      for (const studentItem of mapping.students) {
        const studentId = studentItem.id;
        const finalAction = overrides[studentId] || studentItem.defaultAction;

        if (finalAction === "GRADUATE") {
          // Terminal Class / Graduated Student
          await tx.student.update({
            where: { id: studentId },
            data: {
              enrollmentStatus: "GRADUATED",
              graduationBatch: simulation.sourceBatch.name,
              graduatedAt: new Date(),
              isActive: false // Deactivated from daily class rolls while keeping full academic history
            }
          });

          await tx.promotionAudit.create({
            data: {
              studentId,
              fromBatchId: input.sourceBatchId,
              toBatchId: input.targetBatchId,
              fromBatchName: simulation.sourceBatch.name,
              toBatchName: simulation.targetBatch.name,
              fromClassName: `${studentItem.currentClassName} - ${studentItem.currentSection}`,
              toClassName: "GRADUATED (ALUMNI)",
              action: "GRADUATED",
              authorizedById: input.authorizedById || null,
              remarks: `Graduated from ${studentItem.currentClassName} during ${simulation.sourceBatch.name} rollover`
            }
          });

          graduatedCount++;
        } else if (finalAction === "PROMOTE") {
          // Standard Advancement to next class
          const targetClass = await getOrCreateTargetClass(
            mapping.targetClassName,
            mapping.targetSection
          );

          await tx.student.update({
            where: { id: studentId },
            data: {
              classId: targetClass.id,
              batch: simulation.targetBatch.name,
              enrollmentStatus: "ACTIVE",
              isActive: true
            }
          });

          await tx.promotionAudit.create({
            data: {
              studentId,
              fromBatchId: input.sourceBatchId,
              toBatchId: input.targetBatchId,
              fromBatchName: simulation.sourceBatch.name,
              toBatchName: simulation.targetBatch.name,
              fromClassName: `${studentItem.currentClassName} - ${studentItem.currentSection}`,
              toClassName: `${targetClass.name} - ${targetClass.section}`,
              action: "PROMOTED",
              authorizedById: input.authorizedById || null,
              remarks: `Promoted from ${studentItem.currentClassName} to ${targetClass.name}`
            }
          });

          promotedCount++;
        } else if (finalAction === "RETAIN") {
          // Retained / Repeat Year in same grade under the target batch
          const sameGradeClass = await getOrCreateTargetClass(
            studentItem.currentClassName,
            studentItem.currentSection
          );

          await tx.student.update({
            where: { id: studentId },
            data: {
              classId: sameGradeClass.id,
              batch: simulation.targetBatch.name,
              enrollmentStatus: "RETAINED",
              isActive: true
            }
          });

          await tx.promotionAudit.create({
            data: {
              studentId,
              fromBatchId: input.sourceBatchId,
              toBatchId: input.targetBatchId,
              fromBatchName: simulation.sourceBatch.name,
              toBatchName: simulation.targetBatch.name,
              fromClassName: `${studentItem.currentClassName} - ${studentItem.currentSection}`,
              toClassName: `${sameGradeClass.name} - ${sameGradeClass.section}`,
              action: "RETAINED",
              authorizedById: input.authorizedById || null,
              remarks: `Retained in ${studentItem.currentClassName} for academic reinforcement`
            }
          });

          retainedCount++;
        } else if (finalAction === "TRANSFER") {
          // Transferred / Exited
          await tx.student.update({
            where: { id: studentId },
            data: {
              enrollmentStatus: "TRANSFERRED",
              isActive: false
            }
          });

          await tx.promotionAudit.create({
            data: {
              studentId,
              fromBatchId: input.sourceBatchId,
              toBatchId: input.targetBatchId,
              fromBatchName: simulation.sourceBatch.name,
              toBatchName: simulation.targetBatch.name,
              fromClassName: `${studentItem.currentClassName} - ${studentItem.currentSection}`,
              toClassName: "TRANSFERRED / EXITED",
              action: "TRANSFERRED",
              authorizedById: input.authorizedById || null,
              remarks: "Student transferred or exited prior to new academic batch"
            }
          });

          transferredCount++;
        }
      }
    }

    // Update batch statuses
    await tx.academicBatch.update({
      where: { id: input.sourceBatchId },
      data: {
        status: "COMPLETED",
        isCurrent: false
      }
    });

    await tx.academicBatch.update({
      where: { id: input.targetBatchId },
      data: {
        status: "ACTIVE",
        isCurrent: true
      }
    });

    return {
      success: true,
      sourceBatchName: simulation.sourceBatch.name,
      targetBatchName: simulation.targetBatch.name,
      promotedCount,
      graduatedCount,
      retainedCount,
      transferredCount,
      classesCreatedCount
    };
  }, {
    timeout: 30000 // 30s timeout for comprehensive batch transitions
  });
}
