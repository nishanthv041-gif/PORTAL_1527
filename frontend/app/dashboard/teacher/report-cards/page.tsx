import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import { redirect } from "next/navigation";
import TeacherReportCardsClient, {
  TeacherClass,
  HistoryItem
} from "@/frontend/components/ReportCards/TeacherReportCardsClient";

export default async function TeacherReportCardsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
      classTeacherOf: {
        where: { isActive: true },
        include: {
          students: {
            where: { isActive: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
            include: {
              parents: {
                include: {
                  parent: {
                    include: {
                      user: {
                        select: { id: true, name: true, email: true }
                      }
                    }
                  }
                }
              }
            }
          },
          subjects: {
            orderBy: { name: 'asc' }
          }
        }
      },
      classes: {
        where: { isActive: true },
        include: {
          students: {
            where: { isActive: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
            include: {
              parents: {
                include: {
                  parent: {
                    include: {
                      user: {
                        select: { id: true, name: true, email: true }
                      }
                    }
                  }
                }
              }
            }
          },
          subjects: {
            orderBy: { name: 'asc' }
          }
        },
        orderBy: [{ name: 'asc' }, { section: 'asc' }]
      }
    }
  });

  if (!teacher) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Teacher Profile Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Please ensure your account has a valid teacher record.</p>
      </div>
    );
  }

  // Combine both classes where teacher is subject teacher and class teacher
  const rawClasses = [
    ...(teacher.classes || []),
    ...(teacher.classTeacherOf ? [teacher.classTeacherOf] : [])
  ];
  const uniqueClassMap = new Map<string, typeof rawClasses[0]>();
  rawClasses.forEach(c => {
    if (c && !uniqueClassMap.has(c.id)) {
      uniqueClassMap.set(c.id, c);
    }
  });
  const assignedClasses = Array.from(uniqueClassMap.values());
  const classIds = assignedClasses.map(c => c.id);

  // Fetch all report cards for students belonging to the teacher's classes
  const reportCards = classIds.length > 0
    ? await prisma.reportCard.findMany({
      where: {
        student: {
          classId: { in: classIds }
        }
      },
      include: {
        student: {
          include: {
            class: true
          }
        },
        exam: {
          include: {
            marks: {
              include: {
                subject: true
              }
            }
          }
        }
      },
      orderBy: {
        exam: { date: 'desc' }
      }
    })
    : [];

  const formattedClasses: TeacherClass[] = assignedClasses.map(c => ({
    id: c.id,
    name: c.name,
    section: c.section,
    subjects: (c.subjects || []).map(s => ({
      id: s.id,
      name: s.name,
      maxMarks: s.maxMarks || 100,
      passMarks: s.passMarks || 35
    })),
    students: (c.students || []).map(st => ({
      id: st.id,
      rollNumber: st.rollNumber,
      name: `${st.firstName || ""} ${st.lastName || ""}`.trim() || "Student",
      parents: (st.parents || []).map(p => ({
        name: p.parent?.user?.name || null,
        email: p.parent?.user?.email || null
      }))
    }))
  }));

  const formattedHistory: HistoryItem[] = (reportCards || []).map(rc => {
    const marksList = rc.exam?.marks || [];
    const studentMarks = marksList
      .filter(m => m.studentId === rc.studentId)
      .map(m => ({
        id: m.id,
        subjectId: m.subjectId,
        subjectName: m.subject?.name || "Subject",
        score: m.score,
        maxScore: m.maxScore,
        passMarks: m.subject?.passMarks || 35,
        remarks: m.remarks || null
      }));

    const studentFullName = rc.student
      ? `${rc.student.firstName || ""} ${rc.student.lastName || ""}`.trim() || "Student"
      : "Student";

    return {
      id: rc.id,
      studentId: rc.studentId,
      studentName: studentFullName,
      rollNumber: rc.student?.rollNumber || "",
      className: rc.student?.class ? `${rc.student.class.name} - ${rc.student.class.section}` : "Class",
      classId: rc.student?.classId || null,
      examId: rc.examId,
      examName: rc.exam?.name || "Examination",
      examDate: rc.exam?.date ? new Date(rc.exam.date).toISOString() : new Date().toISOString(),
      totalMarks: rc.totalMarks,
      percentage: rc.percentage,
      grade: rc.grade,
      remarks: rc.remarks || null,
      published: rc.published,
      parentVerified: rc.parentVerified,
      marks: studentMarks
    };
  });

  return (
    <div style={{ padding: 'clamp(0.5rem, 2vw, 1.5rem)' }}>
      <TeacherReportCardsClient
        classes={formattedClasses}
        initialHistory={formattedHistory}
      />
    </div>
  );
}
