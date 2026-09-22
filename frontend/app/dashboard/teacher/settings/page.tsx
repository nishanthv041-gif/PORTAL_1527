import { getServerSession } from "next-auth/next";
import { getAuthOptions } from "@/backend/auth/authOptions";
import { prisma } from "@/backend/db/prisma";
import styles from "../../dashboard.module.css";
import SettingsForm from "./SettingsForm";

export default async function TeacherSettingsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      teacher: true
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
          phone={user.teacher?.phone || ""} 
          qualification={user.teacher?.qualification || ""}
        />
      </div>
    </div>
  );
}
