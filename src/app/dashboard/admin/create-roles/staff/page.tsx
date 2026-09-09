import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import CreateStaffClient from "./CreateStaffClient";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function CreateStaffPage() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== 'ADMIN') return null;

  return (
    <div className={styles.dashboard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Link href="/dashboard/admin/create-roles" style={{ padding: '0.5rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={20} />
        </Link>
        <h1 className={styles.title} style={{ margin: 0 }}>Register Non-Teaching Staff</h1>
      </div>

      <CreateStaffClient />
    </div>
  );
}
