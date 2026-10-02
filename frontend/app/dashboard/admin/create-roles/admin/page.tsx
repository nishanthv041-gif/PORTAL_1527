import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import CreateAdminClient from "./CreateAdminClient";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function CreateAdminPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/admin/create-roles" style={{ padding: '0.5rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className={styles.title} style={{ margin: 0 }}>Add New Admin</h1>
      </div>

      <CreateAdminClient />
    </div>
  );
}
