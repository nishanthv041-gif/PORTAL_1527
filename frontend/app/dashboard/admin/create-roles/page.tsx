import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { isSuperAdmin } from "@/backend/lib/auth/superAdmin";
import Link from "next/link";
import styles from "../../dashboard.module.css";
import { GraduationCap, Users, Shield } from "lucide-react";

export default async function CreateRolesPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  const userIsSuperAdmin = isSuperAdmin(session.user.email);

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title} style={{ marginBottom: '1.5rem' }}>Create New Roles</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        <Link href="/dashboard/admin/create-roles/teacher" prefetch={false} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }} className="hover:shadow-lg hover:-translate-y-1">
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--primary-bg)', color: "var(--primary)", display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <GraduationCap size={40} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Teacher</h2>
          </div>
        </Link>
        
        <Link href="/dashboard/admin/create-roles/parent" prefetch={false} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }} className="hover:shadow-lg hover:-translate-y-1">
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--success-bg)', color: "var(--success)", display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Users size={40} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Parent & Student</h2>
          </div>
        </Link>

        <Link href="/dashboard/admin/create-roles/staff" prefetch={false} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }} className="hover:shadow-lg hover:-translate-y-1">
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(245, 158, 11, 0.1)', color: "var(--warning)", display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <Users size={40} />
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Non-Teaching Staff</h2>
          </div>
        </Link>

        {userIsSuperAdmin && (
          <Link href="/dashboard/admin/create-roles/admin" prefetch={false} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }} className="hover:shadow-lg hover:-translate-y-1">
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', color: "var(--danger)", display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
                <Shield size={40} />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Admin</h2>
              <span style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: 'var(--danger)', fontWeight: 700 }}>SUPER ADMIN ONLY</span>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
