import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, GraduationCap } from "lucide-react";
import { notFound } from "next/navigation";

export default async function ParentDetailsPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  const resolvedParams = await params;

  const parent = await prisma.parent.findUnique({
    where: { id: resolvedParams.id },
    include: {
      user: true,
      children: {
        include: {
          student: {
            include: {
              class: true
            }
          }
        }
      }
    }
  });

  if (!parent) return notFound();

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/admin/parents" style={{ padding: '0.5rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className={styles.title} style={{ margin: 0 }}>Parent Profile</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {/* Personal Info Card */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: "var(--primary)", color: "var(--primary-fg)", display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 600 }}>
              {parent.user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{parent.user.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: parent.isActive ? 'var(--success)' : 'var(--danger)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'currentColor' }} />
                {parent.isActive ? 'Active Account' : 'Inactive Account'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Mail size={18} style={{ color: 'var(--text-secondary)', marginTop: '0.125rem' }} />
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.125rem 0' }}>Email</p>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>{parent.user.email}</p>
                {parent.user.googleEmail && (
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    SSO: {parent.user.googleEmail}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <Phone size={18} style={{ color: 'var(--text-secondary)', marginTop: '0.125rem' }} />
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.125rem 0' }}>Phone</p>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>{parent.phone || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Children Info Card */}
        <div style={{ background: 'var(--card-bg)', borderRadius: '12px', padding: '1.5rem', border: '1px solid var(--border-color)', gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <GraduationCap size={20} /> Linked Students
          </h3>

          {parent.children.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {parent.children.map((child) => (
                <div key={`${child.parentId}-${child.studentId}`} style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>{child.student.firstName} {child.student.lastName}</h4>
                  </div>
                  <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Roll No: {child.student.rollNumber}
                  </p>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Class: {child.student.class ? `${child.student.class.name} - ${child.student.class.section}` : 'Unassigned'}
                  </p>
                  <Link href={`/dashboard/admin/students/${child.student.id}`} style={{ fontSize: '0.875rem', color: 'var(--primary)', textDecoration: 'none' }}>
                    View Student Profile &rarr;
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>No students linked to this parent account.</p>
          )}
        </div>

      </div>
    </div>
  );
}
