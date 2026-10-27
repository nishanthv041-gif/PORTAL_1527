import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import TeacherReportCardsClient, { 
  TeacherClass, 
  HistoryItem 
} from "@/frontend/components/ReportCards/TeacherReportCardsClient";

export default async function TeacherReportCardsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== "TEACHER") return null;

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    include: {
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

  const classIds = teacher.classes.map(c => c.id);

  // Fetch all report cards for students belonging to the teacher's classes
  const reportCards = await prisma.reportCard.findMany({
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
  });

  const formattedClasses: TeacherClass[] = teacher.classes.map(c => ({
    id: c.id,
    name: c.name,
    section: c.section,
    subjects: c.subjects.map(s => ({
      id: s.id,
      name: s.name,
      maxMarks: s.maxMarks || 100,
      passMarks: s.passMarks || 35
    })),
    students: c.students.map(st => ({
      id: st.id,
      rollNumber: st.rollNumber,
      name: `${st.firstName} ${st.lastName}`.trim(),
      parents: st.parents.map(p => ({
        name: p.parent?.user?.name || null,
        email: p.parent?.user?.email || null
      }))
    }))
  }));

  const formattedHistory: HistoryItem[] = reportCards.map(rc => {
    const studentMarks = rc.exam.marks
      .filter(m => m.studentId === rc.studentId)
      .map(m => ({
        id: m.id,
        subjectId: m.subjectId,
        subjectName: m.subject.name,
        score: m.score,
        maxScore: m.maxScore,
        passMarks: m.subject.passMarks,
        remarks: m.remarks
      }));

    return {
      id: rc.id,
      studentId: rc.studentId,
      studentName: `${rc.student.firstName} ${rc.student.lastName}`.trim(),
      rollNumber: rc.student.rollNumber,
      className: rc.student.class ? `${rc.student.class.name} - ${rc.student.class.section}` : "Class",
      classId: rc.student.classId,
      examId: rc.examId,
      examName: rc.exam.name,
      examDate: rc.exam.date.toISOString(),
      totalMarks: rc.totalMarks,
      percentage: rc.percentage,
      grade: rc.grade,
      remarks: rc.remarks,
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
