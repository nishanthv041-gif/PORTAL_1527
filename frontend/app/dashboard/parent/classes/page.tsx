import { getParentAndSelectedChild } from "../parentChildHelper";
import styles from "../../dashboard.module.css";
import ParentChildBanner from "../ParentChildBanner";
import { 
  GraduationCap, Users, BookOpen, User, Mail, Phone, 
  Calendar, Building2, Home, Clock 
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/backend/db/prisma";

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
        <h1 className={styles.title}>Child Classes & Subjects</h1>
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
  const isHostel = selectedChild.residenceType?.toUpperCase().includes("HOSTEL");

  return (
    <div className={styles.dashboard}>
      {/* Top Bar with Child Switcher */}
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
            <GraduationCap className="text-primary" size={28} />
            Child Class & Subjects
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', marginBottom: 0, fontSize: '0.9rem' }}>
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
        <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
          <Users size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>No Class Assigned Yet</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '450px', margin: '0 auto' }}>
            {selectedChild.firstName} is currently not enrolled into an active class or section. Please contact the school administrator.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
          {/* Class Overview Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {/* Card 1: Class Details */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <GraduationCap size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>{childClass.name}</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Section {childClass.section}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Class Strength:</span>
                  <span style={{ fontWeight: 600 }}>{classmatesCount} Students</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Max Capacity:</span>
                  <span style={{ fontWeight: 600 }}>{childClass.maxStrength} Seats</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                  <span style={{ fontWeight: 600, color: childClass.isActive ? 'var(--success)' : 'var(--danger)' }}>
                    {childClass.isActive ? "Active Academic Class" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Class Teacher */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Class Teacher</h3>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mentor & Incharge</span>
                </div>
              </div>

              {childClass.classTeacher ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.875rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--foreground)' }}>
                    {childClass.classTeacher.user.name}
                  </div>
                  {childClass.classTeacher.qualification && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Qualification: {childClass.classTeacher.qualification}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    <Mail size={15} />
                    <span>{childClass.classTeacher.user.email}</span>
                  </div>
                  {childClass.classTeacher.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
                      <Phone size={15} />
                      <span>{childClass.classTeacher.phone}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No designated class teacher assigned.</p>
              )}
            </div>
          </div>

          {/* Subjects and Assigned Faculty Table */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={20} className="text-primary" />
              Subjects & Subject Teachers ({childClass.subjects.length})
            </h3>

            {childClass.subjects.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', padding: '1.5rem 0' }}>No subjects assigned to this class yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.02)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject Code</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject Name</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Teacher</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Max Marks</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Pass Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childClass.subjects.map(sub => (
                      <tr key={sub.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--primary)' }}>
                          {sub.code}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                          {sub.name}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {sub.teacher ? (
                            <div>
                              <div style={{ fontWeight: 500 }}>{sub.teacher.user.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sub.teacher.user.email}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Unassigned</span>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>{sub.maxMarks}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>{sub.passMarks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
