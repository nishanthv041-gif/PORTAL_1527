import { getServerSession } from "next-auth/next";
import { authOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import SettingsForm from "../../teacher/settings/SettingsForm";

export default async function ParentSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      parent: true
    }
  });

  if (!user) return <p>User not found.</p>;

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>Settings</h1>
      
      <div className={styles.chartCard}>
        <h3 className={styles.chartHeader}>Profile Information</h3>
        <SettingsForm 
          userId={user.id} 
          name={user.name} 
          email={user.email} 
          phone={user.parent?.phone || ""} 
          qualification="" // Parent model doesn't have qualification in our basic setup
        />
      </div>
    </div>
  );
}
