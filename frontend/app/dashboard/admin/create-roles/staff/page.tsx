import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import CreateStaffClient from "./CreateStaffClient";
import styles from "../../../dashboard.module.css";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function CreateStaffPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session || session.user.role !== 'ADMIN') return null;

  return (
    <div className={styles.dashboard}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className={styles.title} style={{ margin: 0 }}>Register Non-Teaching Staff</h1>
      </div>

      <CreateStaffClient />
    </div>
  );
}
