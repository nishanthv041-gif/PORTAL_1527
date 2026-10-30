import { getParentAndSelectedChild } from "../parentChildHelper";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import ParentChildBanner from "../ParentChildBanner";
import { Calendar as CalendarIcon, Clock, MapPin, User, Building2, Home } from "lucide-react";
import Link from "next/link";
import ParentTimetableClient from "./ParentTimetableClient";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export default async function ParentTimetablePage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams.childId);

  if (!parent || children.length === 0) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Class Timetable</h1>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No children are linked to your parent account.</p>
        </div>
      </div>
    );
  }

  if (!selectedChild) return null;

  const childClass = selectedChild.class;
  const isHostel = selectedChild.residenceType?.toUpperCase().includes("HOSTEL");

  let scheduleSlots: Array<{
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    period: number;
    classroom: string | null;
    isBreak: boolean;
    subject: {
      name: string;
      code: string;
      teacher: { user: { name: string } } | null;
    } | null;
  }> = [];

  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  let activeSubstitutions: Record<string, {
    substituteTeacherName: string;
    absentTeacherName: string;
    note?: string | null;
  }> = {};

  if (selectedChild.classId) {
    const [rawSlots, rawSubs] = await Promise.all([
      prisma.timetable.findMany({
        where: {
          classId: selectedChild.classId
        },
        include: {
          subject: {
            include: {
              teacher: {
                include: { user: true }
              }
            }
          }
        },
        orderBy: [
          { period: 'asc' },
          { startTime: 'asc' }
        ]
      }),
      prisma.substitution.findMany({
        where: {
          date: todayDate,
          status: "ASSIGNED",
          timetableEntry: { classId: selectedChild.classId }
        },
        include: {
          substituteTeacher: { include: { user: true } },
          absentTeacher: { include: { user: true } }
        }
      })
    ]);

    scheduleSlots = rawSlots;
    for (const sub of rawSubs) {
      if (sub.substituteTeacher?.user?.name) {
        activeSubstitutions[sub.timetableEntryId] = {
          substituteTeacherName: sub.substituteTeacher.user.name,
          absentTeacherName: sub.absentTeacher?.user?.name || "Original Teacher",
          note: sub.note
        };
      }
    }
  }

  const hasAnySchedule = scheduleSlots.length > 0;

  return (
    <div className={styles.dashboard}>
      {/* Header with ChildSwitcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h1 className={styles.title} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CalendarIcon className="text-primary" size={28} />
            Class Timetable &amp; Schedule
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0, fontSize: "0.9rem" }}>
            Weekly period schedule for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong> {childClass ? `(${childClass.name} - ${childClass.section})` : ''}
          </p>
        </div>
      </div>

      {/* Child Class Banner with Child Switching Option */}
      <ParentChildBanner
        selectedChild={selectedChild}
        studentList={children}
        activePage="timetable"
      />

      {!childClass ? (
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Class Assigned</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            This student has not been assigned to a class, so no timetable is available.
          </p>
        </div>
      ) : !hasAnySchedule ? (
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <Clock size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Timetable Published Yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
            The school administrator has not published the schedule for {childClass.name} - Section {childClass.section} yet.
          </p>
        </div>
      ) : (
        <ParentTimetableClient
          childName={`${selectedChild.firstName} ${selectedChild.lastName}`}
          className={`${childClass.name} - Section ${childClass.section}`}
          scheduleSlots={scheduleSlots}
          activeSubstitutions={activeSubstitutions}
        />
      )}
    </div>
  );
}
