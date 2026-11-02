import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { isSuperAdmin } from "@/backend/lib/auth/superAdmin";
import { redirect } from "next/navigation";
import CreateAdminClient from "./CreateAdminClient";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export default async function CreateAdminPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') {
    redirect("/dashboard");
  }

  if (!isSuperAdmin(session.user.email)) {
    return (
      <div className={styles.dashboard}>
        <div style={{ padding: '2rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '14px', color: 'var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <ShieldAlert size={24} />
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Super Admin Privilege Required</h2>
          </div>
          <p style={{ margin: 0, color: 'var(--foreground)' }}>
            Only designated Super Administrators (<strong>jpranav116@gmail.com</strong> and <strong>nishanthv041@gmail.com</strong>) have authorized access to create or delete Admin accounts.
          </p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link href="/dashboard/admin" style={{ padding: '0.6rem 1.2rem', background: 'var(--primary)', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>
              Return to Admin Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Add New Admin</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
          Authorized Super Administrator: <strong>{session.user.email}</strong>
        </p>
      </div>

      <CreateAdminClient />
    </div>
  );
}
