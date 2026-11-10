import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { getLoggedInTeacherClasses, getTeacherClasses, TeacherClass } from "./getTeacherClasses";
import { prisma } from "@/backend/db/prisma";

export interface ClassAccessResult {
  teacherId: string;
  userId: string;
  userRole: "ADMIN" | "TEACHER";
  classId: string;
  className: string;
  isClassTeacher: boolean;
  canEditDob: boolean;
}

export class ClassAccessError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = "ClassAccessError";
    this.statusCode = statusCode;
  }
}

/**
 * Server-side authorization authority for Birthday Suite operations.
 * Modes:
 * - "admin" : Strict administrator-only operations (settings, bulk logs, whole school operations).
 * - "edit-dob": Entering or changing Date of Birth records.
 * - "view-birthdays": Viewing birthday celebrants and calendar.
 */
export async function requireClassAccess(
  classId: string,
  mode: "view-birthdays" | "edit-dob" | "admin" = "view-birthdays"
): Promise<ClassAccessResult> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    throw new ClassAccessError("Unauthorized: Session required.", 401);
  }

  const userRole = session.user.role as "ADMIN" | "TEACHER";

  // 1. Admin access
  if (userRole === "ADMIN") {
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, section: true },
    });
    if (!cls) {
      throw new ClassAccessError("Class not found.", 404);
    }
    return {
      teacherId: "admin",
      userId: session.user.id,
      userRole: "ADMIN",
      classId: cls.id,
      className: `${cls.name} - ${cls.section}`,
      isClassTeacher: true,
      canEditDob: true,
    };
  }

  // Admin-only mode blocks non-admins
  if (mode === "admin") {
    throw new ClassAccessError("Forbidden: Administrator privileges required.", 403);
  }

  // 2. Teacher access
  if (userRole === "TEACHER") {
    const teacherInfo = await getLoggedInTeacherClasses();
    if (!teacherInfo) {
      throw new ClassAccessError("Teacher profile not found.", 403);
    }

    const assigned = teacherInfo.classes.find((c) => c.classId === classId);
    if (!assigned) {
      throw new ClassAccessError(
        "Forbidden: You are not assigned to this class/section.",
        403
      );
    }

    // Designated Class Teacher has full permissions
    if (assigned.isClassTeacher) {
      return {
        teacherId: teacherInfo.teacherId,
        userId: session.user.id,
        userRole: "TEACHER",
        classId: assigned.classId,
        className: assigned.displayName,
        isClassTeacher: true,
        canEditDob: true,
      };
    }

    // Subject teacher: inspect BirthdaySettings switches
    const settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
    const switchA = settings?.subjectTeachersCanViewBirthdays ?? true;
    const switchB = settings?.subjectTeachersCanEnterDob ?? false;

    if (mode === "edit-dob") {
      if (!switchB) {
        throw new ClassAccessError(
          "Forbidden: Date of birth entry is managed by the designated Class Teacher for this section.",
          403
        );
      }
      return {
        teacherId: teacherInfo.teacherId,
        userId: session.user.id,
        userRole: "TEACHER",
        classId: assigned.classId,
        className: assigned.displayName,
        isClassTeacher: false,
        canEditDob: true,
      };
    }

    if (mode === "view-birthdays") {
      if (!switchA) {
        throw new ClassAccessError(
          "Forbidden: Classroom birthday visibility for subject teachers is currently disabled by administrator.",
          403
        );
      }
      return {
        teacherId: teacherInfo.teacherId,
        userId: session.user.id,
        userRole: "TEACHER",
        classId: assigned.classId,
        className: assigned.displayName,
        isClassTeacher: false,
        canEditDob: switchB,
      };
    }
  }

  // 3. Other roles
  throw new ClassAccessError("Forbidden: Teacher or Admin access required.", 403);
}

/**
 * Backward-compatible wrapper for requireClassAccess with edit-dob mode.
 */
export async function requireClassTeacherAccess(classId: string) {
  return requireClassAccess(classId, "edit-dob");
}

export interface AuthorizedBirthdayClassesResult {
  role: "ADMIN" | "TEACHER";
  classes: TeacherClass[];
  allTaughtClasses: TeacherClass[];
  selectedClassId: string | null;
  isDesignatedClassTeacher: boolean;
  canViewBirthdays: boolean;
  canEditDob: boolean;
  switchA_subjectView: boolean;
  switchB_subjectEdit: boolean;
}

/**
 * Resolves authorized classes and capability flags for the logged-in user.
 */
export async function getAuthorizedBirthdayClasses(): Promise<AuthorizedBirthdayClassesResult> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    throw new ClassAccessError("Unauthorized.", 401);
  }

  const settings = await prisma.birthdaySettings.findUnique({ where: { id: "default" } });
  const switchA = settings?.subjectTeachersCanViewBirthdays ?? true;
  const switchB = settings?.subjectTeachersCanEnterDob ?? false;

  if (session.user.role === "ADMIN") {
    const allDbClasses = await prisma.class.findMany({
      where: { isActive: true },
      include: {
        students: { where: { isActive: true }, select: { id: true } },
      },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });

    const formatted: TeacherClass[] = allDbClasses.map((c) => ({
      classId: c.id,
      sectionId: c.id,
      section: c.section,
      name: c.name,
      displayName: `${c.name} - ${c.section}`,
      studentCount: c.students.length,
      isClassTeacher: true,
    }));

    return {
      role: "ADMIN",
      classes: formatted,
      allTaughtClasses: formatted,
      selectedClassId: formatted[0]?.classId || null,
      isDesignatedClassTeacher: true,
      canViewBirthdays: true,
      canEditDob: true,
      switchA_subjectView: true,
      switchB_subjectEdit: true,
    };
  }

  if (session.user.role === "TEACHER") {
    const teacherInfo = await getLoggedInTeacherClasses();
    if (!teacherInfo) {
      return {
        role: "TEACHER",
        classes: [],
        allTaughtClasses: [],
        selectedClassId: null,
        isDesignatedClassTeacher: false,
        canViewBirthdays: false,
        canEditDob: false,
        switchA_subjectView: switchA,
        switchB_subjectEdit: switchB,
      };
    }

    const classTeacherClasses = teacherInfo.classes.filter((c) => c.isClassTeacher);
    const hasClassTeacherClass = classTeacherClasses.length > 0;

    // Accessible classes: Class Teacher classes always; if switchA is ON, also all classes taught
    const accessibleClasses = hasClassTeacherClass
      ? classTeacherClasses
      : (switchA ? teacherInfo.classes : []);

    return {
      role: "TEACHER",
      classes: accessibleClasses,
      allTaughtClasses: teacherInfo.classes,
      selectedClassId: accessibleClasses[0]?.classId || null,
      isDesignatedClassTeacher: hasClassTeacherClass,
      canViewBirthdays: hasClassTeacherClass || (switchA && teacherInfo.classes.length > 0),
      canEditDob: hasClassTeacherClass || switchB,
      switchA_subjectView: switchA,
      switchB_subjectEdit: switchB,
    };
  }

  return {
    role: "TEACHER",
    classes: [],
    allTaughtClasses: [],
    selectedClassId: null,
    isDesignatedClassTeacher: false,
    canViewBirthdays: false,
    canEditDob: false,
    switchA_subjectView: switchA,
    switchB_subjectEdit: switchB,
  };
}
