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
      <div style={{ marginBottom: '2rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Add New Admin</h1>
      </div>

      <CreateAdminClient />
    </div>
  );
}
