import { getParentAndSelectedChild } from "../parentChildHelper";
import styles from "../../dashboard.module.css";
import parentStyles from "./ParentClasses.module.css";
import ParentChildBanner from "../ParentChildBanner";
import { 
  GraduationCap, Users, User, Mail, Phone 
} from "lucide-react";
import { prisma } from "@/backend/db/prisma";
import SubjectsFacultySection from "./SubjectsFacultySection";

export default async function ParentClassesPage({
  searchParams
}: {
  searchParams: Promise<{ childId?: string }>
}) {
  const resolvedSearchParams = await searchParams;
  const { parent, children, selectedChild } = await getParentAndSelectedChild(resolvedSearchParams?.childId);

  if (!parent || children.length === 0) {
    return (
      <div className={styles.dashboard}>
        <h1 className={styles.title}>Child Classes &amp; Subjects</h1>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No children are linked to your parent account.</p>
        </div>
      </div>
    );
  }

  if (!selectedChild) {
    return null;
  }

  // Fetch classmates count for this child's class
  let classmatesCount = 0;

  if (selectedChild.classId) {
    classmatesCount = await prisma.student.count({
      where: { classId: selectedChild.classId, isActive: true }
    });
  }

  const childClass = selectedChild.class;

  return (
    <div className={parentStyles.pageContainer}>
      {/* Top Bar with Child Switcher */}
      <div className={parentStyles.topBar}>
        <div>
          <h1 className={parentStyles.pageTitle}>
            <GraduationCap className="text-primary" size={28} />
            <span>Child Class &amp; Subjects</span>
          </h1>
          <p className={parentStyles.pageSubtitle}>
            Viewing academic class, faculty and subjects for <strong>{selectedChild.firstName} {selectedChild.lastName}</strong>.
          </p>
        </div>
      </div>

      {/* Child Profile Banner with Child Switching Option */}
      <ParentChildBanner 
        selectedChild={selectedChild} 
        studentList={children} 
        activePage="classes" 
      />

      {!childClass ? (
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem 1.5rem', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
          <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Class Assigned Yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '450px', margin: '0 auto' }}>
            {selectedChild.firstName} is currently not enrolled into an active class or section. Please contact the school administrator.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', minWidth: 0 }}>
          {/* Class Overview Cards (Never overflows mobile screens) */}
          <div className={parentStyles.overviewGrid}>
            {/* Card 1: Class Details */}
            <div className={parentStyles.card}>
              <div className={parentStyles.cardHeader}>
                <div className={parentStyles.cardIconCircle} style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)' }}>
                  <GraduationCap size={22} />
                </div>
                <div className={parentStyles.cardTitleGroup}>
                  <h3 className={parentStyles.cardTitle}>{childClass.name}</h3>
                  <span className={parentStyles.cardSubtitle}>Section {childClass.section}</span>
                </div>
              </div>

              <div className={parentStyles.detailList}>
                <div className={parentStyles.detailRow}>
                  <span className={parentStyles.detailLabel}>Class Strength:</span>
                  <span className={parentStyles.detailValue}>{classmatesCount} Students</span>
                </div>
                <div className={parentStyles.detailRow}>
                  <span className={parentStyles.detailLabel}>Max Capacity:</span>
                  <span className={parentStyles.detailValue}>{childClass.maxStrength} Seats</span>
                </div>
                <div className={parentStyles.detailRow}>
                  <span className={parentStyles.detailLabel}>Status:</span>
                  <span className={parentStyles.detailValue} style={{ color: childClass.isActive ? 'var(--success)' : 'var(--danger)' }}>
                    {childClass.isActive ? "Active Academic Class" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Class Teacher (Fixes Teacher Name, Email & Phone overflow) */}
            <div className={parentStyles.card}>
              <div className={parentStyles.cardHeader}>
                <div className={parentStyles.cardIconCircle} style={{ backgroundColor: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                  <User size={22} />
                </div>
                <div className={parentStyles.cardTitleGroup}>
                  <h3 className={parentStyles.cardTitle}>Class Teacher</h3>
                  <span className={parentStyles.cardSubtitle}>Mentor &amp; Incharge</span>
                </div>
              </div>

              {childClass.classTeacher ? (
                <div className={parentStyles.teacherInfo}>
                  <div className={parentStyles.teacherName}>
                    {childClass.classTeacher.user.name}
                  </div>
                  {childClass.classTeacher.qualification && (
                    <div className={parentStyles.teacherMeta}>
                      Qualification: {childClass.classTeacher.qualification}
                    </div>
                  )}
                  <div className={parentStyles.contactItem}>
                    <Mail size={15} className={parentStyles.contactIcon} />
                    <span className={parentStyles.contactText}>
                      {childClass.classTeacher.user.email}
                    </span>
                  </div>
                  {childClass.classTeacher.phone && (
                    <div className={parentStyles.contactItem}>
                      <Phone size={15} className={parentStyles.contactIcon} />
                      <span className={parentStyles.contactText}>
                        {childClass.classTeacher.phone}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                  No designated class teacher assigned.
                </p>
              )}
            </div>
          </div>

          {/* Subjects and Assigned Faculty Table & Cards */}
          <SubjectsFacultySection subjects={childClass.subjects} />
        </div>
      )}
    </div>
  );
}
